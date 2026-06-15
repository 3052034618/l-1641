import { Repository } from 'typeorm';
import { Equipment, SterilizationBatch, WorkOrder } from '../entities';
import { AppDataSource } from '../data-source';
import { CreateEquipmentDto, UpdateEquipmentDto } from '../dtos/equipment.dto';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import { WorkOrderStatus } from '../enums';
import logger from '../config/logger';

export class EquipmentService {
  private equipmentRepository: Repository<Equipment>;
  private batchRepository: Repository<SterilizationBatch>;
  private workOrderRepository: Repository<WorkOrder>;

  constructor() {
    this.equipmentRepository = AppDataSource.getRepository(Equipment);
    this.batchRepository = AppDataSource.getRepository(SterilizationBatch);
    this.workOrderRepository = AppDataSource.getRepository(WorkOrder);
  }

  async createEquipment(dto: CreateEquipmentDto) {
    const existing = await this.equipmentRepository.findOne({
      where: [{ name: dto.name }, { code: dto.code }],
    });

    if (existing) {
      throw new BadRequestError('Equipment with name or code already exists');
    }

    const equipment = this.equipmentRepository.create(dto);
    await this.equipmentRepository.save(equipment);

    logger.info(`Equipment created: ${equipment.name} (${equipment.code})`);

    return equipment;
  }

  async getEquipmentById(id: string) {
    const equipment = await this.equipmentRepository.findOne({
      where: { id },
      relations: ['batches', 'workOrders'],
    });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    return equipment;
  }

  async getEquipments(page: number = 1, pageSize: number = 20, filters?: {
    type?: string;
    search?: string;
    isActive?: boolean;
  }) {
    const queryBuilder = this.equipmentRepository
      .createQueryBuilder('equipment')
      .leftJoinAndSelect('equipment.batches', 'batches');

    if (filters?.type) {
      queryBuilder.andWhere('equipment.type = :type', { type: filters.type });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(equipment.name LIKE :search OR equipment.code LIKE :search OR equipment.model LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.isActive !== undefined) {
      queryBuilder.andWhere('equipment.isActive = :isActive', { isActive: filters.isActive });
    }

    const [equipments, total] = await queryBuilder
      .orderBy('equipment.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { equipments, total };
  }

  async getEquipmentsByType(type: string) {
    const equipments = await this.equipmentRepository.find({
      where: { type, isActive: true },
      order: { name: 'ASC' },
    });

    return equipments;
  }

  async updateEquipment(id: string, dto: UpdateEquipmentDto) {
    const equipment = await this.equipmentRepository.findOne({ where: { id } });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    if (dto.name && dto.name !== equipment.name) {
      const existing = await this.equipmentRepository.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestError('Equipment name already exists');
      }
    }

    if (dto.code && dto.code !== equipment.code) {
      const existing = await this.equipmentRepository.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new BadRequestError('Equipment code already exists');
      }
    }

    Object.assign(equipment, dto);
    await this.equipmentRepository.save(equipment);

    logger.info(`Equipment updated: ${equipment.name}`);

    return equipment;
  }

  async deleteEquipment(id: string) {
    const equipment = await this.equipmentRepository.findOne({ where: { id } });

    if (!equipment) {
      throw new NotFoundError('Equipment not found');
    }

    equipment.isActive = false;
    await this.equipmentRepository.save(equipment);

    logger.info(`Equipment deactivated: ${equipment.name}`);

    return true;
  }

  async getEquipmentStats() {
    const allEquipments = await this.equipmentRepository.find({
      where: { isActive: true },
    });

    const [allBatches] = await this.batchRepository.findAndCount();
    const allWorkOrders = await this.workOrderRepository.find({
      relations: ['equipment', 'assignedEngineer'],
    });

    const typeMap = new Map<string, number>();
    allEquipments.forEach((e) => {
      const key = e.type || 'unknown';
      typeMap.set(key, (typeMap.get(key) || 0) + 1);
    });
    const types = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const last30DaysRuns = await this.batchRepository
      .createQueryBuilder('batch')
      .where('batch.createdAt >= :last30Days', { last30Days })
      .getCount();

    const last30DaysWorkOrders = await this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.createdAt >= :last30Days', { last30Days })
      .getCount();

    const pendingWorkOrders = allWorkOrders.filter(
      (w) =>
        w.status === WorkOrderStatus.OPEN ||
        w.status === WorkOrderStatus.ASSIGNED ||
        w.status === WorkOrderStatus.IN_PROGRESS
    );

    const pendingByType: Record<string, number> = {};
    pendingWorkOrders.forEach((wo) => {
      const key = (wo.equipmentType || wo.equipment?.type || 'unknown') as string;
      pendingByType[key] = (pendingByType[key] || 0) + 1;
    });

    const byStatus = {
      open: allWorkOrders.filter((w) => w.status === WorkOrderStatus.OPEN).length,
      assigned: allWorkOrders.filter((w) => w.status === WorkOrderStatus.ASSIGNED).length,
      inProgress: allWorkOrders.filter((w) => w.status === WorkOrderStatus.IN_PROGRESS).length,
      completed: allWorkOrders.filter((w) => w.status === WorkOrderStatus.COMPLETED).length,
      cancelled: allWorkOrders.filter((w) => w.status === WorkOrderStatus.CANCELLED).length,
    };

    return {
      totalEquipments: allEquipments.length,
      equipmentTypes: types,
      totalRuns: allBatches.length,
      totalWorkOrders: allWorkOrders.length,
      pendingWorkOrders: pendingWorkOrders.length,
      pendingWorkOrdersByType: Object.entries(pendingByType).map(([type, count]) => ({ type, count })),
      pendingWorkOrdersByStatus: byStatus,
      last30DaysRuns,
      last30DaysWorkOrders,
    };
  }

  async getEquipmentTypes() {
    const result = await this.equipmentRepository
      .createQueryBuilder('equipment')
      .select('equipment.type', 'type')
      .where('equipment.type IS NOT NULL')
      .andWhere('equipment.isActive = :isActive', { isActive: true })
      .distinct(true)
      .getRawMany();

    return result.map((r) => r.type);
  }
}

export const equipmentService = new EquipmentService();
