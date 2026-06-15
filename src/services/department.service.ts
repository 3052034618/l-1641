import { Repository } from 'typeorm';
import { Department } from '../entities';
import { AppDataSource } from '../data-source';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dtos/department.dto';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import logger from '../config/logger';

export class DepartmentService {
  private departmentRepository: Repository<Department>;

  constructor() {
    this.departmentRepository = AppDataSource.getRepository(Department);
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const existing = await this.departmentRepository.findOne({
      where: [{ name: dto.name }, { code: dto.code }],
    });

    if (existing) {
      throw new BadRequestError('Department with name or code already exists');
    }

    const department = this.departmentRepository.create(dto);
    await this.departmentRepository.save(department);

    logger.info(`Department created: ${department.name} (${department.code})`);

    return department;
  }

  async getDepartmentById(id: string) {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: ['users', 'packages'],
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    return department;
  }

  async getDepartments(page: number = 1, pageSize: number = 20, filters?: {
    zone?: string;
    search?: string;
    isActive?: boolean;
  }) {
    const queryBuilder = this.departmentRepository
      .createQueryBuilder('department')
      .leftJoinAndSelect('department.users', 'users');

    if (filters?.zone) {
      queryBuilder.andWhere('department.zone = :zone', { zone: filters.zone });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(department.name LIKE :search OR department.code LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.isActive !== undefined) {
      queryBuilder.andWhere('department.isActive = :isActive', { isActive: filters.isActive });
    }

    const [departments, total] = await queryBuilder
      .orderBy('department.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { departments, total };
  }

  async getDepartmentsByZone(zone: string) {
    const departments = await this.departmentRepository.find({
      where: { zone, isActive: true },
      order: { name: 'ASC' },
    });

    return departments;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const department = await this.departmentRepository.findOne({ where: { id } });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    if (dto.name && dto.name !== department.name) {
      const existing = await this.departmentRepository.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestError('Department name already exists');
      }
    }

    if (dto.code && dto.code !== department.code) {
      const existing = await this.departmentRepository.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new BadRequestError('Department code already exists');
      }
    }

    Object.assign(department, dto);
    await this.departmentRepository.save(department);

    logger.info(`Department updated: ${department.name}`);

    return department;
  }

  async deleteDepartment(id: string) {
    const department = await this.departmentRepository.findOne({ where: { id } });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    department.isActive = false;
    await this.departmentRepository.save(department);

    logger.info(`Department deactivated: ${department.name}`);

    return true;
  }

  async getZones() {
    const result = await this.departmentRepository
      .createQueryBuilder('department')
      .select('department.zone', 'zone')
      .where('department.zone IS NOT NULL')
      .andWhere('department.isActive = :isActive', { isActive: true })
      .distinct(true)
      .getRawMany();

    return result.map((r) => r.zone);
  }

  async getDepartmentStats() {
    const [allDepartments] = await this.departmentRepository.findAndCount({
      where: { isActive: true },
    });

    const zones = await this.getZones();

    return {
      totalDepartments: allDepartments.length,
      zones,
      byZone: zones.map((zone) => ({
        zone,
        count: allDepartments.filter((d) => d.zone === zone).length,
      })),
    };
  }
}

export const departmentService = new DepartmentService();
