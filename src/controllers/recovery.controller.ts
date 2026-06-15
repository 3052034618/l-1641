import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { recoveryService } from '../services/recovery.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { CreatePackageDto, RecoveryInspectionDto, RejectPackageDto, UpdatePackageDto, ScanBarcodeDto } from '../dtos/recovery.dto';
import { PackageStatus } from '../enums';

export class RecoveryController {
  async createPackage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as CreatePackageDto;
      const result = await recoveryService.createPackage(dto, operatorId);
      return successResponse(res, result, 'Package created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getPackageByBarcode(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { barcode } = req.params;
      const result = await recoveryService.getPackageByBarcode(barcode);
      return successResponse(res, result, 'Package retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async scanBarcode(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as ScanBarcodeDto;
      const result = await recoveryService.getPackageByBarcode(dto.barcode);
      return successResponse(res, result, 'Barcode scanned successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPackageById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await recoveryService.getPackageById(id);
      return successResponse(res, result, 'Package retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPackages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const status = req.query.status as PackageStatus | undefined;
      const departmentId = req.query.departmentId as string | undefined;
      const isLocked = req.query.isLocked ? req.query.isLocked === 'true' : undefined;
      const search = req.query.search as string | undefined;

      const result = await recoveryService.getPackages(page, pageSize, {
        status,
        departmentId,
        isLocked,
        search,
      });

      return paginatedResponse(res, result.packages, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async inspectAndRecover(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as RecoveryInspectionDto;
      const result = await recoveryService.inspectAndRecover(dto, operatorId);
      return successResponse(res, result, result.isRejected ? 'Package rejected due to missing/damaged items' : 'Package recovered successfully');
    } catch (error) {
      next(error);
    }
  }

  async rejectPackage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as RejectPackageDto;
      const result = await recoveryService.rejectPackage(dto, operatorId);
      return successResponse(res, result, 'Package rejected successfully');
    } catch (error) {
      next(error);
    }
  }

  async updatePackage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdatePackageDto;
      const result = await recoveryService.updatePackage(id, dto);
      return successResponse(res, result, 'Package updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deletePackage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await recoveryService.deletePackage(id);
      return successResponse(res, result, 'Package deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getRecoveryRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const packageId = req.query.packageId as string | undefined;
      const isRejected = req.query.isRejected ? req.query.isRejected === 'true' : undefined;
      const operatorId = req.query.operatorId as string | undefined;

      const result = await recoveryService.getRecoveryRecords(page, pageSize, {
        packageId,
        isRejected,
        operatorId,
      });

      return paginatedResponse(res, result.records, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getPackageTrace(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await recoveryService.getPackageTrace(id);
      return successResponse(res, result, 'Package trace retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTemplates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await recoveryService.getTemplates(page, pageSize);
      return paginatedResponse(res, result.templates, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getInstruments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const search = req.query.search as string | undefined;

      const result = await recoveryService.getInstruments(page, pageSize, search);
      return paginatedResponse(res, result.instruments, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }
}

export const recoveryController = new RecoveryController();
