import { Repository } from 'typeorm';
import { CleaningTask, InstrumentPackage, Equipment } from '../entities';
import { AppDataSource } from '../data-source';
import { CreateCleaningTaskDto, StartCleaningTaskDto, CompleteCleaningTaskDto, CleaningParameters, ProgramConfig, UpdateCleaningTaskDto } from '../dtos/cleaning.dto';
import { ContaminationLevel, CleaningProgram, PackageStatus, WorkOrderPriority } from '../enums';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import { workOrderService } from './workorder.service';
import { notificationService } from './notification.service';
import logger from '../config/logger';

const CLEANING_PROGRAM_CONFIGS: ProgramConfig[] = [
  {
    program: CleaningProgram.STANDARD,
    applicableLevels: [ContaminationLevel.LOW, ContaminationLevel.MEDIUM],
    parameters: {
      waterTemperature: { min: 45, max: 55, unit: '°C' },
      detergentConcentration: { min: 0.5, max: 1.5, unit: '%' },
      cleaningDuration: { min: 10, max: 15, unit: 'min' },
      rinseCount: { min: 3, max: 4, unit: 'times' },
      dryingTemperature: { min: 80, max: 90, unit: '°C' },
      dryingDuration: { min: 20, max: 30, unit: 'min' },
      phValue: { min: 7.0, max: 8.0, unit: 'pH' },
      conductivity: { min: 0, max: 15, unit: 'μS/cm' },
    },
    duration: 60,
  },
  {
    program: CleaningProgram.ENHANCED,
    applicableLevels: [ContaminationLevel.MEDIUM, ContaminationLevel.HIGH],
    parameters: {
      waterTemperature: { min: 55, max: 65, unit: '°C' },
      detergentConcentration: { min: 1.0, max: 2.0, unit: '%' },
      cleaningDuration: { min: 15, max: 25, unit: 'min' },
      rinseCount: { min: 4, max: 5, unit: 'times' },
      dryingTemperature: { min: 90, max: 100, unit: '°C' },
      dryingDuration: { min: 30, max: 45, unit: 'min' },
      phValue: { min: 7.0, max: 8.5, unit: 'pH' },
      conductivity: { min: 0, max: 10, unit: 'μS/cm' },
    },
    duration: 90,
  },
  {
    program: CleaningProgram.INTENSIVE,
    applicableLevels: [ContaminationLevel.HIGH, ContaminationLevel.CRITICAL],
    parameters: {
      waterTemperature: { min: 65, max: 75, unit: '°C' },
      detergentConcentration: { min: 1.5, max: 2.5, unit: '%' },
      cleaningDuration: { min: 25, max: 40, unit: 'min' },
      rinseCount: { min: 5, max: 6, unit: 'times' },
      dryingTemperature: { min: 100, max: 110, unit: '°C' },
      dryingDuration: { min: 45, max: 60, unit: 'min' },
      phValue: { min: 7.5, max: 9.0, unit: 'pH' },
      conductivity: { min: 0, max: 5, unit: 'μS/cm' },
    },
    duration: 120,
  },
  {
    program: CleaningProgram.SPECIAL,
    applicableLevels: [ContaminationLevel.CRITICAL],
    parameters: {
      waterTemperature: { min: 75, max: 85, unit: '°C' },
      detergentConcentration: { min: 2.0, max: 3.0, unit: '%' },
      cleaningDuration: { min: 40, max: 60, unit: 'min' },
      rinseCount: { min: 6, max: 8, unit: 'times' },
      dryingTemperature: { min: 110, max: 120, unit: '°C' },
      dryingDuration: { min: 60, max: 90, unit: 'min' },
      phValue: { min: 8.0, max: 9.5, unit: 'pH' },
      conductivity: { min: 0, max: 3, unit: 'μS/cm' },
    },
    duration: 180,
  },
];

export class CleaningService {
  private cleaningTaskRepository: Repository<CleaningTask>;
  private packageRepository: Repository<InstrumentPackage>;
  private equipmentRepository: Repository<Equipment>;

  constructor() {
    this.cleaningTaskRepository = AppDataSource.getRepository(CleaningTask);
    this.packageRepository = AppDataSource.getRepository(InstrumentPackage);
    this.equipmentRepository = AppDataSource.getRepository(Equipment);
  }

  async assignProgramByContaminationLevel(level: ContaminationLevel): CleaningProgram {
    const eligiblePrograms = CLEANING_PROGRAM_CONFIGS.filter((config) =>
      config.applicableLevels.includes(level)
    );

    if (eligiblePrograms.length === 0) {
      return CleaningProgram.STANDARD;
    }

    return eligiblePrograms[eligiblePrograms.length - 1].program;
  }

  async createTask(dto: CreateCleaningTaskDto, operatorId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    if (pkg.isLocked) {
      throw new BadRequestError('Package is locked, cannot create cleaning task');
    }

    if (pkg.status !== PackageStatus.RECEIVED) {
      throw new BadRequestError('Package must be in RECEIVED status to create cleaning task');
    }

    const existingTask = await this.cleaningTaskRepository.findOne({
      where: {
        packageId: dto.packageId,
        isCompleted: false,
      },
    });

    if (existingTask) {
      throw new BadRequestError('An active cleaning task already exists for this package');
    }

    const assignedProgram = dto.assignedProgram || (await this.assignProgramByContaminationLevel(pkg.contaminationLevel));

    let equipmentId = dto.equipmentId;
    if (!equipmentId) {
      const defaultEquipment = await this.equipmentRepository.findOne({
        where: { type: 'washer' as any, isActive: true },
      });
      if (!defaultEquipment) {
        const anyEquipment = await this.equipmentRepository.findOne({
          where: { isActive: true },
        });
        equipmentId = anyEquipment?.id;
      } else {
        equipmentId = defaultEquipment.id;
      }
    }

    const task = this.cleaningTaskRepository.create({
      packageId: dto.packageId,
      contaminationLevel: pkg.contaminationLevel,
      assignedProgram,
      operatorId,
      equipmentId,
    });

    const oldStatus = pkg.status;
    pkg.status = PackageStatus.CLEANING;

    await this.cleaningTaskRepository.save(task);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.CLEANING
    );

    logger.info(`Cleaning task created for package ${pkg.barcode}, program: ${assignedProgram}, equipment: ${equipmentId}`);

    return task;
  }

  async startTask(dto: StartCleaningTaskDto, operatorId: string) {
    const task = await this.cleaningTaskRepository.findOne({
      where: { id: dto.taskId },
      relations: ['instrumentPackage'],
    });

    if (!task) {
      throw new NotFoundError('Cleaning task not found');
    }

    if (task.isCompleted) {
      throw new BadRequestError('Cleaning task already completed');
    }

    if (task.startedAt) {
      throw new BadRequestError('Cleaning task already started');
    }

    task.startedAt = new Date();
    task.operatorId = operatorId;

    await this.cleaningTaskRepository.save(task);

    logger.info(`Cleaning task ${task.id} started for package ${task.instrumentPackage?.barcode}`);

    return task;
  }

  async completeTask(dto: CompleteCleaningTaskDto, operatorId: string) {
    const task = await this.cleaningTaskRepository.findOne({
      where: { id: dto.taskId },
      relations: ['instrumentPackage'],
    });

    if (!task) {
      throw new NotFoundError('Cleaning task not found');
    }

    if (task.isCompleted) {
      throw new BadRequestError('Cleaning task already completed');
    }

    if (!task.startedAt) {
      throw new BadRequestError('Cleaning task not started');
    }

    const programConfig = CLEANING_PROGRAM_CONFIGS.find(
      (config) => config.program === task.assignedProgram
    );

    const parameterAnomalies = this.validateParameters(dto.runParameters, programConfig!);

    task.runParameters = dto.runParameters;
    task.parameterAnomalies = parameterAnomalies;
    task.hasAnomalies = parameterAnomalies.length > 0;
    task.completedAt = new Date();
    task.isCompleted = true;
    task.isSuccessful = parameterAnomalies.length === 0;
    task.notes = dto.notes;
    task.operatorId = operatorId;

    const pkg = task.instrumentPackage!;
    const oldStatus = pkg.status;

    if (parameterAnomalies.length > 0) {
      const workOrder = await this.createWorkOrderForAnomalies(task, parameterAnomalies);
      task.workOrderId = workOrder.id;
    }

    pkg.status = PackageStatus.CLEANED;

    await this.cleaningTaskRepository.save(task);
    await this.packageRepository.save(pkg);

    await notificationService.notifyCleaningComplete(
      task.id,
      pkg.barcode,
      task.hasAnomalies
    );

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.CLEANED
    );

    logger.info(`Cleaning task ${task.id} completed for package ${pkg.barcode}, anomalies: ${parameterAnomalies.length}`);

    return {
      task,
      parameterAnomalies,
      workOrderId: task.workOrderId,
    };
  }

  private validateParameters(params: CleaningParameters, config: ProgramConfig) {
    const anomalies: any[] = [];

    const paramKeys = Object.keys(params) as Array<keyof CleaningParameters>;

    paramKeys.forEach((key) => {
      const value = params[key];
      const range = config.parameters[key];

      if (range && (value < range.min || value > range.max)) {
        const severity = this.calculateSeverity(value, range);
        anomalies.push({
          parameter: key,
          expectedRange: `${range.min}-${range.max} ${range.unit}`,
          actualValue: value,
          severity,
          description: `${key} ${value} ${range.unit} is out of range (${range.min}-${range.max} ${range.unit})`,
        });
      }
    });

    return anomalies;
  }

  private calculateSeverity(value: number, range: { min: number; max: number }): 'warning' | 'error' {
    const midPoint = (range.min + range.max) / 2;
    const deviation = Math.abs(value - midPoint);
    const maxDeviation = Math.abs(range.max - midPoint);
    const deviationPercent = (deviation / maxDeviation) * 100;

    return deviationPercent > 130 ? 'error' : 'warning';
  }

  private async createWorkOrderForAnomalies(task: CleaningTask, anomalies: any[]) {
    const hasError = anomalies.some((a) => a.severity === 'error');

    let equipmentId = task.equipmentId;
    if (!equipmentId) {
      const equipment = await this.equipmentRepository.findOne({
        where: { isActive: true },
      });
      equipmentId = equipment?.id;
    }

    if (!equipmentId) {
      throw new BadRequestError('No equipment available for work order creation');
    }

    const workOrder = await workOrderService.create({
      equipmentId,
      title: `清洗设备参数异常 - ${task.assignedProgram}`,
      description: `清洗任务运行参数异常：${anomalies.map((a) => a.description).join('; ')}`,
      priority: hasError ? WorkOrderPriority.URGENT : WorkOrderPriority.HIGH,
    }, task.id);

    const equipment = await this.equipmentRepository.findOne({
      where: { id: equipmentId },
    });
    if (equipment) {
      equipment.status = 'MAINTENANCE' as any;
      await this.equipmentRepository.save(equipment);
    }

    return workOrder;
  }

  async getTaskById(id: string) {
    const task = await this.cleaningTaskRepository.findOne({
      where: { id },
      relations: ['instrumentPackage', 'operator', 'workOrder'],
    });

    if (!task) {
      throw new NotFoundError('Cleaning task not found');
    }

    return task;
  }

  async getTasks(page: number = 1, pageSize: number = 20, filters?: {
    packageId?: string;
    isCompleted?: boolean;
    hasAnomalies?: boolean;
    operatorId?: string;
    program?: CleaningProgram;
  }) {
    const queryBuilder = this.cleaningTaskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.instrumentPackage', 'instrumentPackage')
      .leftJoinAndSelect('task.operator', 'operator');

    if (filters?.packageId) {
      queryBuilder.andWhere('task.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.isCompleted !== undefined) {
      queryBuilder.andWhere('task.isCompleted = :isCompleted', { isCompleted: filters.isCompleted });
    }

    if (filters?.hasAnomalies !== undefined) {
      queryBuilder.andWhere('task.hasAnomalies = :hasAnomalies', { hasAnomalies: filters.hasAnomalies });
    }

    if (filters?.operatorId) {
      queryBuilder.andWhere('task.operatorId = :operatorId', { operatorId: filters.operatorId });
    }

    if (filters?.program) {
      queryBuilder.andWhere('task.assignedProgram = :program', { program: filters.program });
    }

    const [tasks, total] = await queryBuilder
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { tasks, total };
  }

  async updateTask(id: string, dto: UpdateCleaningTaskDto) {
    const task = await this.cleaningTaskRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundError('Cleaning task not found');
    }

    if (task.isCompleted) {
      throw new BadRequestError('Cannot update completed cleaning task');
    }

    if (dto.assignedProgram) task.assignedProgram = dto.assignedProgram;
    if (dto.notes) task.notes = dto.notes;

    await this.cleaningTaskRepository.save(task);

    logger.info(`Cleaning task ${id} updated`);

    return task;
  }

  async getProgramConfigs() {
    return CLEANING_PROGRAM_CONFIGS;
  }

  async getTaskStats() {
    const [allTasks] = await this.cleaningTaskRepository.createQueryBuilder('task').getManyAndCount();

    return {
      total: allTasks.length,
      pending: allTasks.filter((t) => !t.startedAt && !t.isCompleted).length,
      running: allTasks.filter((t) => t.startedAt && !t.isCompleted).length,
      completed: allTasks.filter((t) => t.isCompleted && t.isSuccessful).length,
      failed: allTasks.filter((t) => t.isCompleted && !t.isSuccessful).length,
      withAnomalies: allTasks.filter((t) => t.hasAnomalies).length,
    };
  }
}

export const cleaningService = new CleaningService();
