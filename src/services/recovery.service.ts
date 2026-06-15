import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { InstrumentPackage, RecoveryRecord, PackageTemplate, PackageTemplateItem, Instrument } from '../entities';
import { AppDataSource } from '../data-source';
import { CreatePackageDto, RecoveryInspectionDto, RejectPackageDto, UpdatePackageDto, InstrumentItem, CreateTemplateDto, UpdateTemplateDto } from '../dtos/recovery.dto';
import { PackageStatus, ContaminationLevel } from '../enums';
import { NotFoundError, BadRequestError, ConflictError } from '../errors/CustomError';
import { notificationService } from './notification.service';
import logger from '../config/logger';

export class RecoveryService {
  private packageRepository: Repository<InstrumentPackage>;
  private recoveryRepository: Repository<RecoveryRecord>;
  private templateRepository: Repository<PackageTemplate>;
  private templateItemRepository: Repository<PackageTemplateItem>;
  private instrumentRepository: Repository<Instrument>;

  constructor() {
    this.packageRepository = AppDataSource.getRepository(InstrumentPackage);
    this.recoveryRepository = AppDataSource.getRepository(RecoveryRecord);
    this.templateRepository = AppDataSource.getRepository(PackageTemplate);
    this.templateItemRepository = AppDataSource.getRepository(PackageTemplateItem);
    this.instrumentRepository = AppDataSource.getRepository(Instrument);
  }

  async createPackage(dto: CreatePackageDto, operatorId: string) {
    const existing = await this.packageRepository.findOne({
      where: { barcode: dto.barcode },
    });

    if (existing) {
      throw new ConflictError('Barcode already exists');
    }

    let instrumentItems: InstrumentItem[] = [];

    if (dto.templateId) {
      const template = await this.templateRepository.findOne({
        where: { id: dto.templateId },
        relations: ['items', 'items.instrument'],
      });

      if (!template) {
        throw new NotFoundError('Package template not found');
      }

      instrumentItems = template.items.map((item) => ({
        instrumentId: item.instrumentId,
        instrumentCode: item.instrument.code,
        instrumentName: item.instrument.name,
        expectedQuantity: item.requiredQuantity,
        actualQuantity: item.requiredQuantity,
        status: 'normal' as const,
      }));
    } else if (dto.instrumentItems) {
      instrumentItems = dto.instrumentItems;
    }

    const pkg = this.packageRepository.create({
      barcode: dto.barcode,
      name: dto.name,
      departmentId: dto.departmentId,
      templateId: dto.templateId,
      contaminationLevel: dto.contaminationLevel || ContaminationLevel.MEDIUM,
      status: PackageStatus.CREATED,
      instrumentItems,
    });

    await this.packageRepository.save(pkg);

    logger.info(`Package created: ${pkg.barcode} by operator ${operatorId}`);

    return pkg;
  }

  async getPackageByBarcode(barcode: string) {
    const pkg = await this.packageRepository.findOne({
      where: { barcode },
      relations: ['department', 'template', 'template.items', 'template.items.instrument'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    return pkg;
  }

  async getPackageById(id: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id },
      relations: ['department', 'template', 'recoveryRecords', 'cleaningTasks', 'sterilizationBatches', 'distributionRecords'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    return pkg;
  }

  async getPackages(page: number = 1, pageSize: number = 20, filters?: {
    status?: PackageStatus;
    departmentId?: string;
    isLocked?: boolean;
    search?: string;
  }) {
    const queryBuilder = this.packageRepository
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.department', 'department')
      .leftJoinAndSelect('pkg.template', 'template');

    if (filters?.status) {
      queryBuilder.andWhere('pkg.status = :status', { status: filters.status });
    }

    if (filters?.departmentId) {
      queryBuilder.andWhere('pkg.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    if (filters?.isLocked !== undefined) {
      queryBuilder.andWhere('pkg.isLocked = :isLocked', { isLocked: filters.isLocked });
    }

    if (filters?.search) {
      queryBuilder.andWhere('(pkg.barcode LIKE :search OR pkg.name LIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    const [packages, total] = await queryBuilder
      .orderBy('pkg.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { packages, total };
  }

  async inspectAndRecover(dto: RecoveryInspectionDto, operatorId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
      relations: ['department', 'template', 'template.items', 'template.items.instrument'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    if (pkg.isLocked) {
      throw new BadRequestError('Package is locked, cannot process recovery');
    }

    const templateItems = pkg.template?.items || [];
    const inspectionResult = this.validateInstrumentItemsWithTemplate(
      dto.instrumentItems,
      templateItems
    );

    const recoveryRecord = this.recoveryRepository.create({
      packageId: dto.packageId,
      operatorId,
      inspectionResult,
      notes: dto.notes,
    });

    const oldStatus = pkg.status;

    const hasIssues = inspectionResult.totalMissingCount > 0
      || inspectionResult.totalDamagedCount > 0
      || inspectionResult.missingTypes.length > 0;

    if (hasIssues) {
      recoveryRecord.isRejected = true;
      recoveryRecord.rejectionReason = this.generateRejectionReason(inspectionResult);
      recoveryRecord.isComplete = false;

      pkg.status = PackageStatus.REJECTED;
      pkg.instrumentItems = dto.instrumentItems;

      await this.packageRepository.save(pkg);
      await this.recoveryRepository.save(recoveryRecord);

      await notificationService.notifyPackageRejected(
        pkg.id,
        pkg.barcode,
        pkg.departmentId,
        recoveryRecord.rejectionReason
      );

      await notificationService.notifyStatusChange(
        '器械包',
        pkg.id,
        pkg.barcode,
        oldStatus,
        PackageStatus.REJECTED
      );

      logger.warn(`Package ${pkg.barcode} rejected: ${recoveryRecord.rejectionReason}`);

      return {
        package: pkg,
        recoveryRecord,
        isRejected: true,
        inspectionResult,
      };
    }

    recoveryRecord.isComplete = true;
    recoveryRecord.isRejected = false;

    pkg.status = PackageStatus.RECEIVED;
    pkg.instrumentItems = dto.instrumentItems;
    if (dto.contaminationLevel) {
      pkg.contaminationLevel = dto.contaminationLevel;
    }

    await this.packageRepository.save(pkg);
    await this.recoveryRepository.save(recoveryRecord);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.RECEIVED
    );

    logger.info(`Package ${pkg.barcode} recovered successfully`);

    return {
      package: pkg,
      recoveryRecord,
      isRejected: false,
      inspectionResult,
    };
  }

  async rejectPackage(dto: RejectPackageDto, operatorId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
      relations: ['department'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    const oldStatus = pkg.status;

    const recoveryRecord = this.recoveryRepository.create({
      packageId: dto.packageId,
      operatorId,
      isRejected: true,
      rejectionReason: dto.rejectionReason,
      inspectionResult: dto.inspectionResult,
      isComplete: false,
    });

    pkg.status = PackageStatus.REJECTED;

    await this.packageRepository.save(pkg);
    await this.recoveryRepository.save(recoveryRecord);

    await notificationService.notifyPackageRejected(
      pkg.id,
      pkg.barcode,
      pkg.departmentId,
      dto.rejectionReason
    );

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.REJECTED
    );

    logger.warn(`Package ${pkg.barcode} manually rejected: ${dto.rejectionReason}`);

    return {
      package: pkg,
      recoveryRecord,
    };
  }

  async updatePackage(id: string, dto: UpdatePackageDto) {
    const pkg = await this.packageRepository.findOne({ where: { id } });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    if (dto.name) pkg.name = dto.name;
    if (dto.departmentId) pkg.departmentId = dto.departmentId;
    if (dto.contaminationLevel) pkg.contaminationLevel = dto.contaminationLevel;
    if (dto.instrumentItems) pkg.instrumentItems = dto.instrumentItems;
    if (dto.isLocked !== undefined) {
      pkg.isLocked = dto.isLocked;
      if (dto.isLocked) {
        pkg.lockedAt = new Date();
        pkg.lockReason = dto.lockReason || 'Manual lock';
      } else {
        pkg.lockedAt = null as any;
        pkg.lockReason = null as any;
      }
    }

    await this.packageRepository.save(pkg);

    logger.info(`Package ${pkg.barcode} updated`);

    return pkg;
  }

  async deletePackage(id: string) {
    const pkg = await this.packageRepository.findOne({ where: { id } });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    await this.packageRepository.remove(pkg);

    logger.info(`Package ${pkg.barcode} deleted`);

    return { message: 'Package deleted successfully' };
  }

  async getRecoveryRecords(page: number = 1, pageSize: number = 20, filters?: {
    packageId?: string;
    isRejected?: boolean;
    operatorId?: string;
  }) {
    const queryBuilder = this.recoveryRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.instrumentPackage', 'instrumentPackage')
      .leftJoinAndSelect('record.operator', 'operator');

    if (filters?.packageId) {
      queryBuilder.andWhere('record.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.isRejected !== undefined) {
      queryBuilder.andWhere('record.isRejected = :isRejected', { isRejected: filters.isRejected });
    }

    if (filters?.operatorId) {
      queryBuilder.andWhere('record.operatorId = :operatorId', { operatorId: filters.operatorId });
    }

    const [records, total] = await queryBuilder
      .orderBy('record.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { records, total };
  }

  async getPackageTrace(packageId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: packageId },
      relations: [
        'recoveryRecords',
        'recoveryRecords.operator',
        'cleaningTasks',
        'cleaningTasks.operator',
        'sterilizationBatches',
        'sterilizationBatches.operator',
        'sterilizationBatches.equipment',
        'sterilizationBatches.monitoringRecords',
        'distributionRecords',
        'distributionRecords.distributor',
        'distributionRecords.receiver',
        'traceTags',
      ],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    return {
      package: pkg,
      recoveryHistory: pkg.recoveryRecords,
      cleaningHistory: pkg.cleaningTasks,
      sterilizationHistory: pkg.sterilizationBatches,
      distributionHistory: pkg.distributionRecords,
      traceTags: pkg.traceTags,
    };
  }

  private validateInstrumentItems(items: InstrumentItem[]) {
    const missingItems: any[] = [];
    const damagedItems: any[] = [];

    items.forEach((item) => {
      if (item.actualQuantity < item.expectedQuantity) {
        missingItems.push({
          instrumentId: item.instrumentId,
          instrumentCode: item.instrumentCode,
          instrumentName: item.instrumentName,
          expectedQuantity: item.expectedQuantity,
          actualQuantity: item.actualQuantity,
          missingQuantity: item.expectedQuantity - item.actualQuantity,
        });
      }

      if (item.status === 'damaged') {
        damagedItems.push({
          instrumentId: item.instrumentId,
          instrumentCode: item.instrumentCode,
          instrumentName: item.instrumentName,
          description: item.damageDescription || 'Damaged',
        });
      }
    });

    return {
      missingItems,
      damagedItems,
      missingTypes: [],
      totalMissingCount: missingItems.reduce((sum, item) => sum + item.missingQuantity, 0),
      totalDamagedCount: damagedItems.length,
    };
  }

  private validateInstrumentItemsWithTemplate(actualItems: InstrumentItem[], templateItems: any[]) {
    const missingItems: any[] = [];
    const missingTypes: any[] = [];
    const damagedItems: any[] = [];

    const actualItemMap = new Map<string, InstrumentItem>();
    actualItems.forEach((item) => {
      actualItemMap.set(item.instrumentId, item);
    });

    for (const templateItem of templateItems) {
      const actualItem = actualItemMap.get(templateItem.instrumentId);

      if (!actualItem) {
        missingTypes.push({
          instrumentId: templateItem.instrumentId,
          instrumentCode: templateItem.instrument?.code || '',
          instrumentName: templateItem.instrument?.name || 'Unknown',
          expectedQuantity: templateItem.requiredQuantity,
          actualQuantity: 0,
          missingQuantity: templateItem.requiredQuantity,
        });
      } else {
        if (actualItem.actualQuantity < templateItem.requiredQuantity) {
          missingItems.push({
            instrumentId: templateItem.instrumentId,
            instrumentCode: templateItem.instrument?.code || actualItem.instrumentCode,
            instrumentName: templateItem.instrument?.name || actualItem.instrumentName,
            expectedQuantity: templateItem.requiredQuantity,
            actualQuantity: actualItem.actualQuantity,
            missingQuantity: templateItem.requiredQuantity - actualItem.actualQuantity,
          });
        }

        if (actualItem.status === 'damaged') {
          damagedItems.push({
            instrumentId: templateItem.instrumentId,
            instrumentCode: templateItem.instrument?.code || actualItem.instrumentCode,
            instrumentName: templateItem.instrument?.name || actualItem.instrumentName,
            description: actualItem.damageDescription || 'Damaged',
          });
        }

        actualItemMap.delete(templateItem.instrumentId);
      }
    }

    const totalMissingFromTypes = missingTypes.reduce((sum, item) => sum + item.missingQuantity, 0);
    const totalMissingFromQuantity = missingItems.reduce((sum, item) => sum + item.missingQuantity, 0);

    return {
      missingItems,
      missingTypes,
      damagedItems,
      totalMissingCount: totalMissingFromTypes + totalMissingFromQuantity,
      totalDamagedCount: damagedItems.length,
      missingTypeCount: missingTypes.length,
    };
  }

  private generateRejectionReason(inspectionResult: any): string {
    const reasons: string[] = [];

    if (inspectionResult.missingTypes && inspectionResult.missingTypes.length > 0) {
      const typeNames = inspectionResult.missingTypes.map((t: any) => t.instrumentName).join('、');
      reasons.push(`缺少器械类型缺失：${typeNames}（共 ${inspectionResult.missingTypeCount} 种`);
    }

    if (inspectionResult.missingItems && inspectionResult.missingItems.length > 0) {
      reasons.push(`数量不足 ${inspectionResult.totalMissingCount} 件`);
    } else if (inspectionResult.totalMissingCount > 0 && (!inspectionResult.missingTypes || inspectionResult.missingTypes.length === 0)) {
      reasons.push(`缺失 ${inspectionResult.totalMissingCount} 件器械`);
    }

    if (inspectionResult.totalDamagedCount > 0) {
      reasons.push(`${inspectionResult.totalDamagedCount} 件器械损坏`);
    }

    return reasons.join('，');
  }

  async getTemplates(page: number = 1, pageSize: number = 20) {
    const [templates, total] = await this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.items', 'items')
      .leftJoinAndSelect('items.instrument', 'instrument')
      .orderBy('template.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { templates, total };
  }

  async getTemplateById(id: string) {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['items', 'items.instrument'],
    });

    if (!template) {
      throw new NotFoundError('Package template not found');
    }

    return template;
  }

  async createTemplate(dto: CreateTemplateDto) {
    const existing = await this.templateRepository.findOne({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictError('Template code already exists');
    }

    for (const item of dto.items) {
      const instrument = await this.instrumentRepository.findOne({
        where: { id: item.instrumentId },
      });
      if (!instrument) {
        throw new NotFoundError(`Instrument ${item.instrumentId} not found`);
      }
    }

    const template = this.templateRepository.create({
      code: dto.code,
      name: dto.name,
      validDays: dto.validDays || 7,
      description: dto.description || '',
      items: dto.items.map((item) =>
        this.templateItemRepository.create({
          instrumentId: item.instrumentId,
          requiredQuantity: item.requiredQuantity,
        })
      ),
    });

    await this.templateRepository.save(template);

    logger.info(`Package template created: ${template.code}`);

    return this.getTemplateById(template.id);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!template) {
      throw new NotFoundError('Package template not found');
    }

    if (dto.name) template.name = dto.name;
    if (dto.validDays !== undefined) template.validDays = dto.validDays;
    if (dto.description !== undefined) template.description = dto.description;

    if (dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        const instrument = await this.instrumentRepository.findOne({
          where: { id: item.instrumentId },
        });
        if (!instrument) {
          throw new NotFoundError(`Instrument ${item.instrumentId} not found`);
        }
      }

      await this.templateItemRepository.delete({ templateId: id });
      template.items = dto.items.map((item) =>
        this.templateItemRepository.create({
          templateId: id,
          instrumentId: item.instrumentId,
          requiredQuantity: item.requiredQuantity,
        })
      );
    }

    await this.templateRepository.save(template);

    logger.info(`Package template updated: ${template.code}`);

    return this.getTemplateById(id);
  }

  async deleteTemplate(id: string) {
    const template = await this.templateRepository.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundError('Package template not found');
    }

    await this.templateRepository.remove(template);

    logger.info(`Package template deleted: ${template.code}`);

    return { message: 'Template deleted successfully' };
  }

  async getRecoveryStats(startDate?: Date, endDate?: Date, departmentId?: string) {
    const queryBuilder = this.recoveryRepository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.instrumentPackage', 'instrumentPackage');

    if (startDate) {
      queryBuilder.andWhere('record.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('record.createdAt <= :endDate', { endDate });
    }
    if (departmentId) {
      queryBuilder.andWhere('instrumentPackage.departmentId = :departmentId', { departmentId });
    }

    const [records] = await queryBuilder.getManyAndCount();

    const totalRecords = records.length;
    const rejectedRecords = records.filter((r) => r.isRejected).length;
    const completedRecords = records.filter((r) => r.isComplete).length;

    let totalMissingCount = 0;
    let totalDamagedCount = 0;
    records.forEach((r) => {
      if (r.inspectionResult) {
        totalMissingCount += r.inspectionResult.totalMissingCount || 0;
        totalDamagedCount += r.inspectionResult.totalDamagedCount || 0;
      }
    });

    return {
      totalRecords,
      completedRecords,
      rejectedRecords,
      rejectRate: totalRecords > 0
        ? parseFloat(((rejectedRecords / totalRecords) * 100).toFixed(2))
        : 0,
      totalMissingCount,
      totalDamagedCount,
    };
  }

  async getInstruments(page: number = 1, pageSize: number = 20, search?: string) {
    const queryBuilder = this.instrumentRepository.createQueryBuilder('instrument');

    if (search) {
      queryBuilder.where('(instrument.code LIKE :search OR instrument.name LIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [instruments, total] = await queryBuilder
      .orderBy('instrument.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { instruments, total };
  }
}

export const recoveryService = new RecoveryService();
