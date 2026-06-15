import { Repository } from 'typeorm';
import { WorkOrder, Equipment, User } from '../entities';
import { AppDataSource } from '../data-source';
import { WorkOrderDto, UpdateWorkOrderDto, AssignWorkOrderDto } from '../dtos/cleaning.dto';
import { WorkOrderStatus, WorkOrderPriority, SterilizerType, UserRole } from '../enums';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import { notificationService } from './notification.service';
import logger from '../config/logger';

export class WorkOrderService {
  private workOrderRepository: Repository<WorkOrder>;
  private equipmentRepository: Repository<Equipment>;
  private userRepository: Repository<User>;

  constructor() {
    this.workOrderRepository = AppDataSource.getRepository(WorkOrder);
    this.equipmentRepository = AppDataSource.getRepository(Equipment);
    this.userRepository = AppDataSource.getRepository(User);
  }

  async create(dto: WorkOrderDto, sourceTaskId?: string) {
    const equipment = await this.equipmentRepository.findOne({
      where: { id: dto.equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    const orderCode = this.generateOrderCode();

    const workOrder = this.workOrderRepository.create({
      orderCode,
      equipmentId: dto.equipmentId,
      equipmentType: equipment.type,
      title: dto.title,
      description: dto.description,
      priority: (dto.priority as WorkOrderPriority) || WorkOrderPriority.MEDIUM,
      cleaningTaskId: sourceTaskId,
      dueDate: this.calculateDueDate(dto.priority as WorkOrderPriority),
    });

    await this.workOrderRepository.save(workOrder);

    if (dto.assignedEngineerId) {
      await this.assign({
        workOrderId: workOrder.id,
        engineerId: dto.assignedEngineerId,
      });
    } else {
      await this.autoAssignEngineer(workOrder);
    }

    logger.info(`Work order ${orderCode} created for equipment ${equipment.code}`);

    return workOrder;
  }

  async autoAssignEngineer(workOrder: WorkOrder) {
    const equipment = await this.equipmentRepository.findOne({
      where: { id: workOrder.equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    const engineers = await this.userRepository.find({
      where: {
        role: UserRole.ENGINEER,
        isActive: true,
      },
      relations: ['assignedWorkOrders'],
    });

    if (engineers.length === 0) {
      logger.warn(`No engineers available to assign work order ${workOrder.orderCode}`);
      return null;
    }

    const selectedEngineer = this.selectBestEngineer(engineers, equipment.type);

    if (selectedEngineer) {
      workOrder.assignedEngineerId = selectedEngineer.id;
      workOrder.status = WorkOrderStatus.ASSIGNED;
      workOrder.assignedAt = new Date();

      await this.workOrderRepository.save(workOrder);

      await notificationService.notifyWorkOrderAssigned(
        workOrder.id,
        workOrder.orderCode,
        selectedEngineer.id,
        equipment.name,
        workOrder.priority
      );

      logger.info(`Work order ${workOrder.orderCode} auto-assigned to engineer ${selectedEngineer.realName}`);
    }

    return selectedEngineer;
  }

  private selectBestEngineer(engineers: User[], equipmentType?: SterilizerType): User | null {
    if (engineers.length === 0) return null;

    let candidateEngineers = [...engineers];

    if (equipmentType) {
      const specializedEngineers = engineers.filter((engineer) =>
        engineer.specializedEquipmentTypes?.includes(equipmentType)
      );
      if (specializedEngineers.length > 0) {
        candidateEngineers = specializedEngineers;
      }
    }

    const scoredEngineers = candidateEngineers.map((engineer) => {
      const activeWorkOrders = engineer.assignedWorkOrders.filter(
        (wo) =>
          wo.status === WorkOrderStatus.OPEN ||
          wo.status === WorkOrderStatus.ASSIGNED ||
          wo.status === WorkOrderStatus.IN_PROGRESS
      ).length;

      const hasSpecialization = equipmentType
        ? engineer.specializedEquipmentTypes?.includes(equipmentType)
        : false;

      return {
        engineer,
        activeWorkOrders,
        score: (hasSpecialization ? 10000 : 0) - activeWorkOrders,
      };
    });

    scoredEngineers.sort((a, b) => b.score - a.score);

    return scoredEngineers[0].engineer;
  }

  async assign(dto: AssignWorkOrderDto) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id: dto.workOrderId },
      relations: ['equipment'],
    });

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    const engineer = await this.userRepository.findOne({
      where: { id: dto.engineerId, role: UserRole.ENGINEER, isActive: true },
    });

    if (!engineer) {
      throw new NotFoundError('Engineer not found or inactive');
    }

    workOrder.assignedEngineerId = dto.engineerId;
    workOrder.status = WorkOrderStatus.ASSIGNED;
    workOrder.assignedAt = new Date();

    await this.workOrderRepository.save(workOrder);

    await notificationService.notifyWorkOrderAssigned(
      workOrder.id,
      workOrder.orderCode,
      engineer.id,
      workOrder.equipment?.name || 'Unknown Equipment',
      workOrder.priority
    );

    logger.info(`Work order ${workOrder.orderCode} assigned to engineer ${engineer.realName}`);

    return workOrder;
  }

  async update(id: string, dto: UpdateWorkOrderDto, userId: string) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: ['assignedEngineer', 'equipment'],
    });

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    if (dto.status) {
      const statusEnum = dto.status as WorkOrderStatus;

      if (statusEnum === WorkOrderStatus.IN_PROGRESS && workOrder.status !== WorkOrderStatus.ASSIGNED) {
        throw new BadRequestError('Can only start work order from ASSIGNED status');
      }

      if (statusEnum === WorkOrderStatus.COMPLETED && workOrder.status !== WorkOrderStatus.IN_PROGRESS) {
        throw new BadRequestError('Can only complete work order from IN_PROGRESS status');
      }

      if (statusEnum === WorkOrderStatus.IN_PROGRESS) {
        workOrder.startedAt = new Date();
      }

      if (statusEnum === WorkOrderStatus.COMPLETED) {
        workOrder.completedAt = new Date();
      }

      workOrder.status = statusEnum;
    }

    if (dto.resolution) workOrder.resolution = dto.resolution;
    if (dto.repairNotes) workOrder.repairNotes = dto.repairNotes;
    if (dto.actualCost !== undefined) workOrder.actualCost = dto.actualCost;

    await this.workOrderRepository.save(workOrder);

    logger.info(`Work order ${workOrder.orderCode} updated by user ${userId}`);

    return workOrder;
  }

  async getById(id: string) {
    const workOrder = await this.workOrderRepository.findOne({
      where: { id },
      relations: ['equipment', 'assignedEngineer', 'cleaningTask'],
    });

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    return workOrder;
  }

  async getWorkOrders(page: number = 1, pageSize: number = 20, filters?: {
    status?: WorkOrderStatus;
    priority?: WorkOrderPriority;
    equipmentId?: string;
    assignedEngineerId?: string;
    equipmentType?: SterilizerType;
  }) {
    const queryBuilder = this.workOrderRepository
      .createQueryBuilder('workOrder')
      .leftJoinAndSelect('workOrder.equipment', 'equipment')
      .leftJoinAndSelect('workOrder.assignedEngineer', 'assignedEngineer');

    if (filters?.status) {
      queryBuilder.andWhere('workOrder.status = :status', { status: filters.status });
    }

    if (filters?.priority) {
      queryBuilder.andWhere('workOrder.priority = :priority', { priority: filters.priority });
    }

    if (filters?.equipmentId) {
      queryBuilder.andWhere('workOrder.equipmentId = :equipmentId', { equipmentId: filters.equipmentId });
    }

    if (filters?.assignedEngineerId) {
      queryBuilder.andWhere('workOrder.assignedEngineerId = :assignedEngineerId', {
        assignedEngineerId: filters.assignedEngineerId,
      });
    }

    if (filters?.equipmentType) {
      queryBuilder.andWhere('workOrder.equipmentType = :equipmentType', { equipmentType: filters.equipmentType });
    }

    const [workOrders, total] = await queryBuilder
      .orderBy('workOrder.priority', 'DESC')
      .addOrderBy('workOrder.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { workOrders, total };
  }

  async getEngineerWorkOrders(engineerId: string, page: number = 1, pageSize: number = 20) {
    return this.getWorkOrders(page, pageSize, { assignedEngineerId: engineerId });
  }

  async startWorkOrder(id: string, engineerId: string) {
    const workOrder = await this.workOrderRepository.findOne({ where: { id } });

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    if (workOrder.assignedEngineerId !== engineerId) {
      throw new BadRequestError('You are not assigned to this work order');
    }

    if (workOrder.status !== WorkOrderStatus.ASSIGNED) {
      throw new BadRequestError('Work order is not in assignable status');
    }

    workOrder.status = WorkOrderStatus.IN_PROGRESS;
    workOrder.startedAt = new Date();

    await this.workOrderRepository.save(workOrder);

    logger.info(`Engineer ${engineerId} started work order ${workOrder.orderCode}`);

    return workOrder;
  }

  async completeWorkOrder(id: string, engineerId: string, resolution: string, actualCost?: number) {
    const workOrder = await this.workOrderRepository.findOne({ where: { id } });

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    if (workOrder.assignedEngineerId !== engineerId) {
      throw new BadRequestError('You are not assigned to this work order');
    }

    if (workOrder.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestError('Work order is not in progress');
    }

    workOrder.status = WorkOrderStatus.COMPLETED;
    workOrder.completedAt = new Date();
    workOrder.resolution = resolution;
    if (actualCost !== undefined) workOrder.actualCost = actualCost;

    await this.workOrderRepository.save(workOrder);

    const equipment = await this.equipmentRepository.findOne({
      where: { id: workOrder.equipmentId },
    });
    if (equipment) {
      equipment.lastMaintenanceDate = new Date();
      await this.equipmentRepository.save(equipment);
    }

    logger.info(`Engineer ${engineerId} completed work order ${workOrder.orderCode}`);

    return workOrder;
  }

  private generateOrderCode(): string {
    const date = new Date();
    const prefix = 'WO';
    const timestamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  private calculateDueDate(priority?: WorkOrderPriority): Date {
    const now = new Date();
    const hoursToAdd: Record<WorkOrderPriority, number> = {
      [WorkOrderPriority.URGENT]: 4,
      [WorkOrderPriority.HIGH]: 24,
      [WorkOrderPriority.MEDIUM]: 72,
      [WorkOrderPriority.LOW]: 168,
    };

    const hours = priority ? hoursToAdd[priority] : 72;
    now.setHours(now.getHours() + hours);
    return now;
  }

  async getWorkOrderStats(engineerId?: string) {
    const queryBuilder = this.workOrderRepository.createQueryBuilder('workOrder');

    if (engineerId) {
      queryBuilder.where('workOrder.assignedEngineerId = :engineerId', { engineerId });
    }

    const [allOrders] = await queryBuilder.getManyAndCount();

    const stats = {
      total: allOrders.length,
      open: allOrders.filter((wo) => wo.status === WorkOrderStatus.OPEN).length,
      assigned: allOrders.filter((wo) => wo.status === WorkOrderStatus.ASSIGNED).length,
      inProgress: allOrders.filter((wo) => wo.status === WorkOrderStatus.IN_PROGRESS).length,
      completed: allOrders.filter((wo) => wo.status === WorkOrderStatus.COMPLETED).length,
      closed: allOrders.filter((wo) => wo.status === WorkOrderStatus.CLOSED).length,
      urgent: allOrders.filter((wo) => wo.priority === WorkOrderPriority.URGENT && wo.status !== WorkOrderStatus.COMPLETED && wo.status !== WorkOrderStatus.CLOSED).length,
    };

    return stats;
  }
}

export const workOrderService = new WorkOrderService();
