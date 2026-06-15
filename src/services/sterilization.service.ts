import { Repository } from 'typeorm';
import { SterilizationBatch, SterilizationRecord, InstrumentPackage, Equipment, TraceTag, PackageTemplate } from '../entities';
import { AppDataSource } from '../data-source';
import {
  CreateSterilizationBatchDto,
  StartSterilizationDto,
  SterilizationDataDto,
  CompleteSterilizationDto,
  ReinspectBatchDto,
  UnlockBatchDto,
  SterilizationThresholds,
  UpdateBatchDto,
  BatchFinalResult,
} from '../dtos/sterilization.dto';
import { PackageStatus, SterilizationStatus } from '../enums';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import { notificationService } from './notification.service';
import { webSocketServer } from '../sockets/WebSocketServer';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export class SterilizationService {
  private batchRepository: Repository<SterilizationBatch>;
  private recordRepository: Repository<SterilizationRecord>;
  private packageRepository: Repository<InstrumentPackage>;
  private equipmentRepository: Repository<Equipment>;
  private traceTagRepository: Repository<TraceTag>;
  private templateRepository: Repository<PackageTemplate>;

  constructor() {
    this.batchRepository = AppDataSource.getRepository(SterilizationBatch);
    this.recordRepository = AppDataSource.getRepository(SterilizationRecord);
    this.packageRepository = AppDataSource.getRepository(InstrumentPackage);
    this.equipmentRepository = AppDataSource.getRepository(Equipment);
    this.traceTagRepository = AppDataSource.getRepository(TraceTag);
    this.templateRepository = AppDataSource.getRepository(PackageTemplate);
  }

  async createBatch(dto: CreateSterilizationBatchDto, operatorId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
      relations: ['template'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    if (pkg.isLocked) {
      throw new BadRequestError('Package is locked, cannot create sterilization batch');
    }

    if (pkg.status !== PackageStatus.CLEANED) {
      throw new BadRequestError('Package must be in CLEANED status to create sterilization batch');
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: dto.equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    const existingBatch = await this.batchRepository.findOne({
      where: {
        packageId: dto.packageId,
        status: SterilizationStatus.RUNNING,
      },
    });

    if (existingBatch) {
      throw new BadRequestError('An active sterilization batch already exists for this package');
    }

    const batchCode = this.generateBatchCode();

    const batch = this.batchRepository.create({
      batchCode,
      equipmentId: dto.equipmentId,
      packageId: dto.packageId,
      operatorId,
      status: SterilizationStatus.PENDING,
    });

    const oldStatus = pkg.status;
    pkg.status = PackageStatus.STERILIZING;

    await this.batchRepository.save(batch);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.STERILIZING
    );

    logger.info(`Sterilization batch ${batchCode} created for package ${pkg.barcode}`);

    return batch;
  }

  async startBatch(dto: StartSterilizationDto, operatorId: string) {
    const batch = await this.batchRepository.findOne({
      where: { id: dto.batchId },
      relations: ['instrumentPackage', 'equipment'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (batch.status !== SterilizationStatus.PENDING) {
      throw new BadRequestError('Batch is not in PENDING status');
    }

    if (batch.isLocked) {
      throw new BadRequestError('Batch is locked, cannot start');
    }

    batch.status = SterilizationStatus.RUNNING;
    batch.startedAt = new Date();
    batch.operatorId = operatorId;
    batch.cycleCount = batch.cycleCount + 1;

    await this.batchRepository.save(batch);

    logger.info(`Sterilization batch ${batch.batchCode} started`);

    return batch;
  }

  async submitData(dto: SterilizationDataDto) {
    const batch = await this.batchRepository.findOne({
      where: { id: dto.batchId },
      relations: ['instrumentPackage', 'equipment'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (batch.status !== SterilizationStatus.RUNNING) {
      throw new BadRequestError('Batch is not running');
    }

    const thresholds: SterilizationThresholds = {
      minTemperature: batch.equipment.minTemperature,
      maxTemperature: batch.equipment.maxTemperature,
      minPressure: batch.equipment.minPressure,
      maxPressure: batch.equipment.maxPressure,
    };

    const anomalyCheck = this.checkAnomalies(dto.temperature, dto.pressure, thresholds);

    const record = this.recordRepository.create({
      batchId: dto.batchId,
      temperature: dto.temperature,
      pressure: dto.pressure,
      isTemperatureAbnormal: anomalyCheck.isTemperatureAbnormal,
      isPressureAbnormal: anomalyCheck.isPressureAbnormal,
      anomalyDetails: anomalyCheck.details,
    });

    await this.recordRepository.save(record);

    if (anomalyCheck.isTemperatureAbnormal || anomalyCheck.isPressureAbnormal) {
      await this.handleAnomalies(batch, dto.temperature, dto.pressure, anomalyCheck);
    }

    this.broadcastRealTimeData(batch, dto.temperature, dto.pressure, anomalyCheck);

    return {
      record,
      isAbnormal: anomalyCheck.isTemperatureAbnormal || anomalyCheck.isPressureAbnormal,
    };
  }

  private checkAnomalies(temperature: number, pressure: number, thresholds: SterilizationThresholds) {
    let isTemperatureAbnormal = false;
    let isPressureAbnormal = false;
    let temperatureStatus: 'normal' | 'over' | 'under' = 'normal';
    let pressureStatus: 'normal' | 'over' | 'under' = 'normal';

    if (temperature > thresholds.maxTemperature) {
      isTemperatureAbnormal = true;
      temperatureStatus = 'over';
    } else if (temperature < thresholds.minTemperature) {
      isTemperatureAbnormal = true;
      temperatureStatus = 'under';
    }

    if (pressure > thresholds.maxPressure) {
      isPressureAbnormal = true;
      pressureStatus = 'over';
    } else if (pressure < thresholds.minPressure) {
      isPressureAbnormal = true;
      pressureStatus = 'under';
    }

    return {
      isTemperatureAbnormal,
      isPressureAbnormal,
      details: {
        temperatureStatus,
        pressureStatus,
        expectedTempRange: `${thresholds.minTemperature}-${thresholds.maxTemperature}°C`,
        expectedPressureRange: `${thresholds.minPressure}-${thresholds.maxPressure}kPa`,
      },
    };
  }

  private async handleAnomalies(
    batch: SterilizationBatch,
    temperature: number,
    pressure: number,
    anomalyCheck: any
  ) {
    if (!batch.isLocked) {
      batch.isLocked = true;
      batch.lockReason = `Parameter anomaly detected: ${anomalyCheck.isTemperatureAbnormal ? `temperature ${temperature}°C` : ''}${anomalyCheck.isTemperatureAbnormal && anomalyCheck.isPressureAbnormal ? ', ' : ''}${anomalyCheck.isPressureAbnormal ? `pressure ${pressure}kPa` : ''}`;
      batch.lockedAt = new Date();

      await this.batchRepository.save(batch);

      const alertType = anomalyCheck.isTemperatureAbnormal ? 'temperature' : 'pressure';
      const value = anomalyCheck.isTemperatureAbnormal ? temperature : pressure;
      const expectedRange = anomalyCheck.isTemperatureAbnormal
        ? anomalyCheck.details.expectedTempRange
        : anomalyCheck.details.expectedPressureRange;

      await notificationService.notifySterilizationAlert(
        batch.id,
        batch.batchCode,
        batch.instrumentPackage?.barcode || 'Unknown',
        alertType,
        value,
        expectedRange
      );

      logger.warn(`Sterilization batch ${batch.batchCode} locked due to parameter anomaly`);
    }
  }

  private broadcastRealTimeData(
    batch: SterilizationBatch,
    temperature: number,
    pressure: number,
    anomalyCheck: any
  ) {
    const data = {
      batchId: batch.id,
      batchCode: batch.batchCode,
      packageId: batch.packageId,
      packageBarcode: batch.instrumentPackage?.barcode,
      temperature,
      pressure,
      isTemperatureAbnormal: anomalyCheck.isTemperatureAbnormal,
      isPressureAbnormal: anomalyCheck.isPressureAbnormal,
      isLocked: batch.isLocked,
      timestamp: new Date().toISOString(),
    };

    webSocketServer.sendToAll('sterilization_data', data);

    if (anomalyCheck.isTemperatureAbnormal || anomalyCheck.isPressureAbnormal) {
      webSocketServer.sendToAll('sterilization_alert', {
        ...data,
        anomalyDetails: anomalyCheck.details,
        lockReason: batch.lockReason,
      });
    }
  }

  async completeBatch(dto: CompleteSterilizationDto, operatorId: string) {
    const batch = await this.batchRepository.findOne({
      where: { id: dto.batchId },
      relations: ['instrumentPackage', 'equipment', 'monitoringRecords'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (batch.status !== SterilizationStatus.RUNNING) {
      throw new BadRequestError('Batch is not running');
    }

    const finalResult = this.calculateFinalResult(batch);

    batch.status = SterilizationStatus.COMPLETED;
    batch.completedAt = new Date();
    batch.finalResult = finalResult;
    batch.operatorId = operatorId;

    const pkg = batch.instrumentPackage!;
    const oldStatus = pkg.status;

    if (batch.isLocked && !dto.isManualOverride) {
      batch.status = SterilizationStatus.FAILED;
      pkg.status = PackageStatus.LOCKED;
      pkg.isLocked = true;
      pkg.lockReason = `Sterilization failed: ${finalResult.failedReason}`;
      pkg.lockedAt = new Date();

      await this.batchRepository.save(batch);
      await this.packageRepository.save(pkg);

      logger.warn(`Sterilization batch ${batch.batchCode} failed due to locked status`);

      return {
        batch,
        finalResult,
        isPassed: false,
      };
    }

    if (finalResult.isPassed) {
      batch.status = SterilizationStatus.COMPLETED;
      pkg.status = PackageStatus.STERILIZED;
      pkg.sterilizedAt = new Date();

      const template = pkg.template || await this.templateRepository.findOne({
        where: { id: pkg.templateId || '' },
      });

      const validDays = template?.validDays || 7;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);
      pkg.validUntil = validUntil;

      await this.generateTraceTag(batch, pkg, validUntil);
    } else {
      batch.status = SterilizationStatus.FAILED;
      pkg.status = PackageStatus.LOCKED;
      pkg.isLocked = true;
      pkg.lockReason = `Sterilization failed: ${finalResult.failedReason}`;
      pkg.lockedAt = new Date();
    }

    await this.batchRepository.save(batch);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      pkg.status
    );

    logger.info(`Sterilization batch ${batch.batchCode} completed, passed: ${finalResult.isPassed}`);

    return {
      batch,
      finalResult,
      isPassed: finalResult.isPassed,
    };
  }

  private calculateFinalResult(batch: SterilizationBatch): BatchFinalResult {
    const records = batch.monitoringRecords || [];

    if (records.length === 0) {
      return {
        averageTemperature: 0,
        averagePressure: 0,
        totalDuration: 0,
        temperatureAnomalies: 0,
        pressureAnomalies: 0,
        isPassed: false,
        failedReason: 'No monitoring records found',
      };
    }

    const totalTemp = records.reduce((sum, r) => sum + r.temperature, 0);
    const totalPressure = records.reduce((sum, r) => sum + r.pressure, 0);
    const tempAnomalies = records.filter((r) => r.isTemperatureAbnormal).length;
    const pressureAnomalies = records.filter((r) => r.isPressureAbnormal).length;

    const startTime = batch.startedAt || new Date();
    const endTime = batch.completedAt || new Date();
    const totalDuration = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60);

    const avgTemp = totalTemp / records.length;
    const avgPressure = totalPressure / records.length;

    const anomalyThreshold = records.length * 0.1;
    const isPassed = tempAnomalies <= anomalyThreshold && pressureAnomalies <= anomalyThreshold;

    let failedReason = '';
    if (!isPassed) {
      const reasons: string[] = [];
      if (tempAnomalies > anomalyThreshold) {
        reasons.push(`${tempAnomalies} temperature anomalies`);
      }
      if (pressureAnomalies > anomalyThreshold) {
        reasons.push(`${pressureAnomalies} pressure anomalies`);
      }
      failedReason = reasons.join(', ');
    }

    return {
      averageTemperature: Math.round(avgTemp * 100) / 100,
      averagePressure: Math.round(avgPressure * 100) / 100,
      totalDuration,
      temperatureAnomalies: tempAnomalies,
      pressureAnomalies,
      isPassed,
      failedReason,
    };
  }

  private async generateTraceTag(batch: SterilizationBatch, pkg: InstrumentPackage, validUntil: Date) {
    const tagCode = `TT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const qrCode = this.generateQRCodeData(pkg, batch, validUntil);

    const traceTag = this.traceTagRepository.create({
      tagCode,
      qrCode,
      packageId: pkg.id,
      sterilizationBatchId: batch.id,
      sterilizedAt: new Date(),
      validUntil,
      sterilizerCode: batch.equipment?.code || 'UNKNOWN',
      batchCode: batch.batchCode,
      isValid: true,
      traceData: qrCode,
    });

    await this.traceTagRepository.save(traceTag);

    logger.info(`Trace tag ${tagCode} generated for package ${pkg.barcode}`);

    return traceTag;
  }

  private generateQRCodeData(pkg: InstrumentPackage, batch: SterilizationBatch, validUntil: Date): string {
    const data = {
      packageId: pkg.id,
      packageBarcode: pkg.barcode,
      packageName: pkg.name,
      batchId: batch.id,
      batchCode: batch.batchCode,
      sterilizedAt: new Date().toISOString(),
      validUntil: validUntil.toISOString(),
      sterilizerCode: batch.equipment?.code,
      departmentId: pkg.departmentId,
      version: '1.0',
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  async reinspectBatch(dto: ReinspectBatchDto, operatorId: string) {
    const batch = await this.batchRepository.findOne({
      where: { id: dto.batchId },
      relations: ['instrumentPackage'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (!batch.isLocked) {
      throw new BadRequestError('Batch is not locked, no need for reinspection');
    }

    batch.isReinspected = true;
    batch.reinspectedAt = new Date();

    const pkg = batch.instrumentPackage!;
    const oldStatus = pkg.status;

    if (dto.isPassed) {
      batch.isLocked = false;
      batch.lockReason = null as any;
      batch.lockedAt = null as any;

      pkg.isLocked = false;
      pkg.lockReason = null as any;
      pkg.lockedAt = null as any;
      pkg.status = PackageStatus.STERILIZED;

      const template = pkg.template || await this.templateRepository.findOne({
        where: { id: pkg.templateId || '' },
      });

      const validDays = template?.validDays || 7;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);
      pkg.validUntil = validUntil;
      pkg.sterilizedAt = new Date();

      await this.generateTraceTag(batch, pkg, validUntil);
    } else {
      batch.status = SterilizationStatus.FAILED;
      pkg.status = PackageStatus.LOCKED;
      pkg.lockReason = `Reinspection failed: ${dto.notes || 'Failed reinspection'}`;
    }

    await this.batchRepository.save(batch);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      pkg.status
    );

    logger.info(`Batch ${batch.batchCode} reinspected, passed: ${dto.isPassed}`);

    return {
      batch,
      package: pkg,
      isPassed: dto.isPassed,
    };
  }

  async unlockBatch(dto: UnlockBatchDto, operatorId: string) {
    const batch = await this.batchRepository.findOne({
      where: { id: dto.batchId },
      relations: ['instrumentPackage'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (!batch.isLocked) {
      throw new BadRequestError('Batch is not locked');
    }

    batch.isLocked = false;
    batch.lockReason = null as any;
    batch.lockedAt = null as any;

    const pkg = batch.instrumentPackage!;

    if (pkg.isLocked) {
      pkg.isLocked = false;
      pkg.lockReason = null as any;
      pkg.lockedAt = null as any;
    }

    await this.batchRepository.save(batch);
    await this.packageRepository.save(pkg);

    logger.info(`Batch ${batch.batchCode} unlocked by operator ${operatorId}`);

    return {
      batch,
      package: pkg,
    };
  }

  async getBatchById(id: string) {
    const batch = await this.batchRepository.findOne({
      where: { id },
      relations: ['instrumentPackage', 'equipment', 'operator', 'monitoringRecords'],
    });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    return batch;
  }

  async getBatches(page: number = 1, pageSize: number = 20, filters?: {
    packageId?: string;
    equipmentId?: string;
    status?: SterilizationStatus;
    isLocked?: boolean;
  }) {
    const queryBuilder = this.batchRepository
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.instrumentPackage', 'instrumentPackage')
      .leftJoinAndSelect('batch.equipment', 'equipment');

    if (filters?.packageId) {
      queryBuilder.andWhere('batch.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.equipmentId) {
      queryBuilder.andWhere('batch.equipmentId = :equipmentId', { equipmentId: filters.equipmentId });
    }

    if (filters?.status) {
      queryBuilder.andWhere('batch.status = :status', { status: filters.status });
    }

    if (filters?.isLocked !== undefined) {
      queryBuilder.andWhere('batch.isLocked = :isLocked', { isLocked: filters.isLocked });
    }

    const [batches, total] = await queryBuilder
      .orderBy('batch.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { batches, total };
  }

  async getBatchRecords(batchId: string, page: number = 1, pageSize: number = 100) {
    const [records, total] = await this.recordRepository
      .createQueryBuilder('record')
      .where('record.batchId = :batchId', { batchId })
      .orderBy('record.recordTime', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { records, total };
  }

  async updateBatch(id: string, dto: UpdateBatchDto) {
    const batch = await this.batchRepository.findOne({ where: { id } });

    if (!batch) {
      throw new NotFoundError('Sterilization batch not found');
    }

    if (batch.status === SterilizationStatus.RUNNING || batch.status === SterilizationStatus.COMPLETED) {
      throw new BadRequestError('Cannot update batch in RUNNING or COMPLETED status');
    }

    if (dto.equipmentId) batch.equipmentId = dto.equipmentId;
    if (dto.notes) batch.notes = dto.notes;

    await this.batchRepository.save(batch);

    logger.info(`Batch ${batch.batchCode} updated`);

    return batch;
  }

  async getBatchStats() {
    const [allBatches] = await this.batchRepository.createQueryBuilder('batch').getManyAndCount();

    return {
      total: allBatches.length,
      pending: allBatches.filter((b) => b.status === SterilizationStatus.PENDING).length,
      running: allBatches.filter((b) => b.status === SterilizationStatus.RUNNING).length,
      completed: allBatches.filter((b) => b.status === SterilizationStatus.COMPLETED).length,
      failed: allBatches.filter((b) => b.status === SterilizationStatus.FAILED).length,
      locked: allBatches.filter((b) => b.isLocked).length,
      passRate: allBatches.length > 0
        ? Math.round((allBatches.filter((b) => b.status === SterilizationStatus.COMPLETED).length / allBatches.length) * 100)
        : 0,
    };
  }

  async getRealTimeStatus() {
    const runningBatches = await this.batchRepository.find({
      where: { status: SterilizationStatus.RUNNING },
      relations: ['instrumentPackage', 'equipment'],
    });

    return {
      runningCount: runningBatches.length,
      batches: runningBatches.map((batch) => ({
        id: batch.id,
        batchCode: batch.batchCode,
        packageBarcode: batch.instrumentPackage?.barcode,
        equipmentCode: batch.equipment?.code,
        isLocked: batch.isLocked,
        startedAt: batch.startedAt,
        cycleCount: batch.cycleCount,
      })),
    };
  }

  private generateBatchCode(): string {
    const date = new Date();
    const prefix = 'SB';
    const timestamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }
}

export const sterilizationService = new SterilizationService();
