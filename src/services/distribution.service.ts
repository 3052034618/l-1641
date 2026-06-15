import { Repository } from 'typeorm';
import * as moment from 'moment';
import { DistributionRecord, InstrumentPackage, TraceTag, Department, User } from '../entities';
import { AppDataSource } from '../data-source';
import {
  CreateDistributionDto,
  VerifyPackageDto,
  ScanTagDto,
  ConfirmReceiptDto,
  UpdateDistributionDto,
  ValidationResult,
  GenerateTagDto,
} from '../dtos/distribution.dto';
import { PackageStatus } from '../enums';
import { NotFoundError, BadRequestError } from '../errors/CustomError';
import { notificationService } from './notification.service';
import logger from '../config/logger';

export class DistributionService {
  private distributionRepository: Repository<DistributionRecord>;
  private packageRepository: Repository<InstrumentPackage>;
  private tagRepository: Repository<TraceTag>;
  private departmentRepository: Repository<Department>;
  private userRepository: Repository<User>;

  constructor() {
    this.distributionRepository = AppDataSource.getRepository(DistributionRecord);
    this.packageRepository = AppDataSource.getRepository(InstrumentPackage);
    this.tagRepository = AppDataSource.getRepository(TraceTag);
    this.departmentRepository = AppDataSource.getRepository(Department);
    this.userRepository = AppDataSource.getRepository(User);
  }

  async verifyPackage(dto: VerifyPackageDto): Promise<ValidationResult> {
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
      relations: ['traceTags', 'sterilizationBatches', 'sterilizationBatches.equipment'],
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    const latestBatch = pkg.sterilizationBatches
      .filter((b) => b.status === 'completed')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0];

    const now = new Date();
    const validUntil = pkg.validUntil || new Date();
    const daysRemaining = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isExpired = now > validUntil;

    return {
      packageStatus: pkg.status,
      validUntil,
      isValid: pkg.status === PackageStatus.STERILIZED && !pkg.isLocked && !isExpired,
      daysRemaining,
      isExpired,
      isLocked: pkg.isLocked,
      lockReason: pkg.lockReason || '',
      sterilizationInfo: {
        sterilizedAt: pkg.sterilizedAt || new Date(),
        batchCode: latestBatch?.batchCode || '',
        sterilizerCode: latestBatch?.equipment?.code || '',
      },
    };
  }

  async verifyPackageByBarcode(barcode: string): Promise<ValidationResult> {
    const pkg = await this.packageRepository.findOne({
      where: { barcode },
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    return this.verifyPackage({ packageId: pkg.id });
  }

  async createDistribution(dto: CreateDistributionDto, distributorId: string) {
    const validation = await this.verifyPackage({ packageId: dto.packageId });

    if (!validation.isValid) {
      if (validation.isExpired) {
        await this.handleExpiredPackage(dto.packageId);
        throw new BadRequestError('Package is expired and has been locked', { validation });
      }
      if (validation.isLocked) {
        throw new BadRequestError('Package is locked', { validation });
      }
      throw new BadRequestError('Package is not valid for distribution', { validation });
    }

    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId },
    });

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    const toDepartment = await this.departmentRepository.findOne({
      where: { id: dto.toDepartmentId },
    });

    if (!toDepartment) {
      throw new NotFoundError('Target department not found');
    }

    const receiver = await this.userRepository.findOne({
      where: { id: dto.receiverId },
    });

    if (!receiver) {
      throw new NotFoundError('Receiver not found');
    }

    const distribution = this.distributionRepository.create({
      packageId: dto.packageId,
      toDepartmentId: dto.toDepartmentId,
      distributorId,
      receiverId: dto.receiverId,
      isValidCheckPerformed: true,
      isExpired: validation.isExpired,
      validationResult: validation,
    });

    const oldStatus = pkg.status;
    pkg.status = PackageStatus.DISTRIBUTED;

    const validTag = pkg.traceTags?.find((t) => t.isValid);
    if (validTag) {
      validTag.usedAt = new Date();
      validTag.isValid = false;
      await this.tagRepository.save(validTag);
    }

    await this.distributionRepository.save(distribution);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.DISTRIBUTED
    );

    logger.info(`Package ${pkg.barcode} distributed to department ${toDepartment.name}`);

    return {
      distribution,
      package: pkg,
      validation,
    };
  }

  async scanTag(dto: ScanTagDto) {
    const tag = await this.tagRepository.findOne({
      where: { tagCode: dto.tagCode },
      relations: ['instrumentPackage', 'sterilizationBatch', 'sterilizationBatch.equipment'],
    });

    if (!tag) {
      throw new NotFoundError('Trace tag not found');
    }

    const validation = await this.verifyPackage({ packageId: tag.packageId });

    const decodedData = this.decodeQRCodeData(tag.qrCode);

    return {
      tag,
      validation,
      decodedData,
    };
  }

  async confirmReceipt(dto: ConfirmReceiptDto, receiverId: string) {
    const distribution = await this.distributionRepository.findOne({
      where: { id: dto.distributionId },
      relations: ['instrumentPackage', 'toDepartment'],
    });

    if (!distribution) {
      throw new NotFoundError('Distribution record not found');
    }

    if (distribution.receiverId !== receiverId) {
      throw new BadRequestError('You are not the designated receiver');
    }

    if (distribution.isReceived) {
      throw new BadRequestError('Receipt already confirmed');
    }

    distribution.isReceived = true;
    distribution.receivedAt = new Date();

    const pkg = distribution.instrumentPackage;
    const oldStatus = pkg.status;
    pkg.status = PackageStatus.USED;

    await this.distributionRepository.save(distribution);
    await this.packageRepository.save(pkg);

    await notificationService.notifyStatusChange(
      '器械包',
      pkg.id,
      pkg.barcode,
      oldStatus,
      PackageStatus.USED
    );

    logger.info(`Package ${pkg.barcode} receipt confirmed by receiver ${receiverId}`);

    return {
      distribution,
      package: pkg,
    };
  }

  private async handleExpiredPackage(packageId: string) {
    const pkg = await this.packageRepository.findOne({
      where: { id: packageId },
      relations: ['department'],
    });

    if (!pkg) {
      return;
    }

    if (!pkg.isLocked) {
      const now = new Date();
      const validUntil = pkg.validUntil || new Date();
      const daysExpired = Math.ceil((now.getTime() - validUntil.getTime()) / (1000 * 60 * 60 * 24));

      pkg.isLocked = true;
      pkg.lockReason = `Package expired on ${validUntil.toISOString().split('T')[0]}`;
      pkg.lockedAt = new Date();
      pkg.status = PackageStatus.EXPIRED;

      await this.packageRepository.save(pkg);

      await notificationService.notifyPackageExpired(
        pkg.id,
        pkg.barcode,
        pkg.departmentId,
        daysExpired
      );

      logger.warn(`Package ${pkg.barcode} locked due to expiration (${daysExpired} days)`);
    }
  }

  async checkAndLockExpiredPackages() {
    const now = new Date();

    const expiredPackages = await this.packageRepository
      .createQueryBuilder('pkg')
      .where('pkg.validUntil < :now', { now })
      .andWhere('pkg.isLocked = :isLocked', { isLocked: false })
      .andWhere('pkg.status IN (:...statuses)', {
        statuses: [PackageStatus.STERILIZED, PackageStatus.READY],
      })
      .leftJoinAndSelect('pkg.department', 'department')
      .getMany();

    const results: any[] = [];

    for (const pkg of expiredPackages) {
      const validUntil = pkg.validUntil || new Date();
      const daysExpired = Math.ceil((now.getTime() - validUntil.getTime()) / (1000 * 60 * 60 * 24));

      pkg.isLocked = true;
      pkg.lockReason = `Package expired on ${validUntil.toISOString().split('T')[0]}`;
      pkg.lockedAt = new Date();
      pkg.status = PackageStatus.EXPIRED;

      await this.packageRepository.save(pkg);

      await notificationService.notifyPackageExpired(
        pkg.id,
        pkg.barcode,
        pkg.departmentId,
        daysExpired
      );

      results.push({
        packageId: pkg.id,
        barcode: pkg.barcode,
        daysExpired,
      });

      logger.warn(`Package ${pkg.barcode} locked due to expiration (${daysExpired} days)`);
    }

    return {
      totalProcessed: expiredPackages.length,
      lockedPackages: results,
    };
  }

  async getDistributionById(id: string) {
    const distribution = await this.distributionRepository.findOne({
      where: { id },
      relations: ['instrumentPackage', 'toDepartment', 'distributor', 'receiver'],
    });

    if (!distribution) {
      throw new NotFoundError('Distribution record not found');
    }

    return distribution;
  }

  async getDistributions(page: number = 1, pageSize: number = 20, filters?: {
    packageId?: string;
    toDepartmentId?: string;
    distributorId?: string;
    isReceived?: boolean;
    isExpired?: boolean;
  }) {
    const queryBuilder = this.distributionRepository
      .createQueryBuilder('distribution')
      .leftJoinAndSelect('distribution.instrumentPackage', 'instrumentPackage')
      .leftJoinAndSelect('distribution.toDepartment', 'toDepartment')
      .leftJoinAndSelect('distribution.distributor', 'distributor')
      .leftJoinAndSelect('distribution.receiver', 'receiver');

    if (filters?.packageId) {
      queryBuilder.andWhere('distribution.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.toDepartmentId) {
      queryBuilder.andWhere('distribution.toDepartmentId = :toDepartmentId', {
        toDepartmentId: filters.toDepartmentId,
      });
    }

    if (filters?.distributorId) {
      queryBuilder.andWhere('distribution.distributorId = :distributorId', {
        distributorId: filters.distributorId,
      });
    }

    if (filters?.isReceived !== undefined) {
      queryBuilder.andWhere('distribution.isReceived = :isReceived', { isReceived: filters.isReceived });
    }

    if (filters?.isExpired !== undefined) {
      queryBuilder.andWhere('distribution.isExpired = :isExpired', { isExpired: filters.isExpired });
    }

    const [distributions, total] = await queryBuilder
      .orderBy('distribution.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { distributions, total };
  }

  async updateDistribution(id: string, dto: UpdateDistributionDto) {
    const distribution = await this.distributionRepository.findOne({ where: { id } });

    if (!distribution) {
      throw new NotFoundError('Distribution record not found');
    }

    if (distribution.isReceived) {
      throw new BadRequestError('Cannot update confirmed distribution');
    }

    if (dto.toDepartmentId) distribution.toDepartmentId = dto.toDepartmentId;
    if (dto.receiverId) distribution.receiverId = dto.receiverId;
    if (dto.notes) distribution.notes = dto.notes;

    await this.distributionRepository.save(distribution);

    logger.info(`Distribution ${id} updated`);

    return distribution;
  }

  async getTagById(id: string) {
    const tag = await this.tagRepository.findOne({
      where: { id },
      relations: ['instrumentPackage', 'sterilizationBatch', 'sterilizationBatch.equipment'],
    });

    if (!tag) {
      throw new NotFoundError('Trace tag not found');
    }

    return tag;
  }

  async getTags(page: number = 1, pageSize: number = 20, filters?: {
    packageId?: string;
    isValid?: boolean;
  }) {
    const queryBuilder = this.tagRepository
      .createQueryBuilder('tag')
      .leftJoinAndSelect('tag.instrumentPackage', 'instrumentPackage');

    if (filters?.packageId) {
      queryBuilder.andWhere('tag.packageId = :packageId', { packageId: filters.packageId });
    }

    if (filters?.isValid !== undefined) {
      queryBuilder.andWhere('tag.isValid = :isValid', { isValid: filters.isValid });
    }

    const [tags, total] = await queryBuilder
      .orderBy('tag.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { tags, total };
  }

  async getDistributionStats() {
    const [allDistributions] = await this.distributionRepository.createQueryBuilder('d').getManyAndCount();
    const [allPackages] = await this.packageRepository.createQueryBuilder('p').getManyAndCount();

    const now = new Date();

    const expiredCount = allPackages.filter(
      (p) => p.validUntil && now > p.validUntil && p.status !== PackageStatus.USED
    ).length;

    const lockedCount = allPackages.filter((p) => p.isLocked).length;

    return {
      totalDistributions: allDistributions.length,
      pendingReceipt: allDistributions.filter((d) => !d.isReceived).length,
      completed: allDistributions.filter((d) => d.isReceived).length,
      expiredPackages: expiredCount,
      lockedPackages: lockedCount,
      expiringToday: allPackages.filter((p) => {
        if (!p.validUntil) return false;
        const diffDays = Math.ceil((p.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays === 0 && p.status === PackageStatus.STERILIZED;
      }).length,
      expiringSoon: allPackages.filter((p) => {
        if (!p.validUntil) return false;
        const diffDays = Math.ceil((p.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 3 && p.status === PackageStatus.STERILIZED;
      }).length,
    };
  }

  private decodeQRCodeData(qrCode: string) {
    try {
      const decoded = Buffer.from(qrCode, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  async getPackageReadyForDistribution(page: number = 1, pageSize: number = 20, filters?: {
    departmentId?: string;
    search?: string;
  }) {
    const queryBuilder = this.packageRepository
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.department', 'department')
      .leftJoinAndSelect('pkg.traceTags', 'traceTags')
      .where('pkg.status = :status', { status: PackageStatus.STERILIZED })
      .andWhere('pkg.isLocked = :isLocked', { isLocked: false })
      .andWhere('pkg.validUntil > :now', { now: new Date() });

    if (filters?.departmentId) {
      queryBuilder.andWhere('pkg.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    if (filters?.search) {
      queryBuilder.andWhere('(pkg.barcode LIKE :search OR pkg.name LIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    const [packages, total] = await queryBuilder
      .orderBy('pkg.validUntil', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { packages, total };
  }
}

export const distributionService = new DistributionService();
