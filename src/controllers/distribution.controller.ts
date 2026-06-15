import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { distributionService } from '../services/distribution.service';
import { successResponse, paginatedResponse } from '../utils/response';
import {
  CreateDistributionDto,
  VerifyPackageDto,
  ScanTagDto,
  ConfirmReceiptDto,
  UpdateDistributionDto,
} from '../dtos/distribution.dto';

export class DistributionController {
  async verifyPackage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as VerifyPackageDto;
      const result = await distributionService.verifyPackage(dto);
      return successResponse(res, result, result.isValid
        ? 'Package is valid for distribution'
        : 'Package validation failed');
    } catch (error) {
      next(error);
    }
  }

  async verifyPackageByBarcode(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { barcode } = req.params;
      const result = await distributionService.verifyPackageByBarcode(barcode);
      return successResponse(res, result, result.isValid
        ? 'Package is valid for distribution'
        : 'Package validation failed');
    } catch (error) {
      next(error);
    }
  }

  async createDistribution(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const distributorId = req.user!.userId;
      const dto = req.body as CreateDistributionDto;
      const result = await distributionService.createDistribution(dto, distributorId);
      return successResponse(res, result, 'Distribution created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async scanTag(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ScanTagDto;
      const result = await distributionService.scanTag(dto);
      return successResponse(res, result, 'Tag scanned successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirmReceipt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const receiverId = req.user!.userId;
      const dto = req.body as ConfirmReceiptDto;
      const result = await distributionService.confirmReceipt(dto, receiverId);
      return successResponse(res, result, 'Receipt confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  async checkAndLockExpired(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await distributionService.checkAndLockExpiredPackages();
      return successResponse(res, result, `Processed ${result.totalProcessed} expired packages`);
    } catch (error) {
      next(error);
    }
  }

  async getDistributionById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await distributionService.getDistributionById(id);
      return successResponse(res, result, 'Distribution record retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getDistributions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const packageId = req.query.packageId as string | undefined;
      const toDepartmentId = req.query.toDepartmentId as string | undefined;
      const distributorId = req.query.distributorId as string | undefined;
      const isReceived = req.query.isReceived ? req.query.isReceived === 'true' : undefined;
      const isExpired = req.query.isExpired ? req.query.isExpired === 'true' : undefined;

      const result = await distributionService.getDistributions(page, pageSize, {
        packageId,
        toDepartmentId,
        distributorId,
        isReceived,
        isExpired,
      });

      return paginatedResponse(res, result.distributions, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async updateDistribution(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateDistributionDto;
      const result = await distributionService.updateDistribution(id, dto);
      return successResponse(res, result, 'Distribution updated');
    } catch (error) {
      next(error);
    }
  }

  async getTagById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await distributionService.getTagById(id);
      return successResponse(res, result, 'Trace tag retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTags(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const packageId = req.query.packageId as string | undefined;
      const isValid = req.query.isValid ? req.query.isValid === 'true' : undefined;

      const result = await distributionService.getTags(page, pageSize, {
        packageId,
        isValid,
      });

      return paginatedResponse(res, result.tags, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await distributionService.getDistributionStats();
      return successResponse(res, result, 'Distribution stats retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getReadyPackages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const departmentId = req.query.departmentId as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await distributionService.getPackageReadyForDistribution(page, pageSize, {
        departmentId,
        search,
      });

      return paginatedResponse(res, result.packages, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }
}

export const distributionController = new DistributionController();
