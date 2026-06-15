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
    const [allEquipments] = await this.equipmentRepository.findAndCount({
      where: { isActive: true },
    });

    const [allBatches] = await this.batchRepository.findAndCount();
    const [allWorkOrders] = await this.workOrderRepository.findAndCount();

    const types = [...new Set(allEquipments.map((e) => e.type))];

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [recentBatches] = await this.batchRepository.findAndCount({
      where: { createdAt: new Date() as any },
    });

    const [recentWorkOrders] = await this.workOrderRepository.findAndCount({
      where: { createdAt: new Date() as any },
    });

    const pendingWorkOrders = allWorkOrders.filter(
      (w) => w.status === WorkOrderStatus.PENDING || w.status === WorkOrderStatus.ASSIGNED
    );

    return {
      totalEquipments: allEquipments.length,
      types: types.map((type) => ({
        type,
        count: allEquipments.filter((e) => e.type === type).length,
      })),
      totalRuns: allBatches.length,
      totalWorkOrders: allWorkOrders.length,
      pendingWorkOrders: pendingWorkOrders.length,
      last30DaysRuns: recentBatches.length,
      last30DaysWorkOrders: recentWorkOrders.length,
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
