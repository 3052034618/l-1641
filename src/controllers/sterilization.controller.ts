import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sterilizationService } from '../services/sterilization.service';
import { successResponse, paginatedResponse } from '../utils/response';
import {
  CreateSterilizationBatchDto,
  StartSterilizationDto,
  SterilizationDataDto,
  CompleteSterilizationDto,
  ReinspectBatchDto,
  UnlockBatchDto,
  UpdateBatchDto,
} from '../dtos/sterilization.dto';
import { SterilizationStatus } from '../enums';

export class SterilizationController {
  async createBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as CreateSterilizationBatchDto;
      const result = await sterilizationService.createBatch(dto, operatorId);
      return successResponse(res, result, 'Sterilization batch created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async startBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as StartSterilizationDto;
      const result = await sterilizationService.startBatch(dto, operatorId);
      return successResponse(res, result, 'Sterilization batch started');
    } catch (error) {
      next(error);
    }
  }

  async submitData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as SterilizationDataDto;
      const result = await sterilizationService.submitData(dto);
      return successResponse(res, result, result.isAbnormal
        ? 'Data submitted with anomalies detected'
        : 'Data submitted successfully');
    } catch (error) {
      next(error);
    }
  }

  async completeBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as CompleteSterilizationDto;
      const result = await sterilizationService.completeBatch(dto, operatorId);
      return successResponse(res, result, result.isPassed
        ? 'Sterilization completed successfully, trace tag generated'
        : 'Sterilization failed, package locked');
    } catch (error) {
      next(error);
    }
  }

  async reinspectBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as ReinspectBatchDto;
      const result = await sterilizationService.reinspectBatch(dto, operatorId);
      return successResponse(res, result, result.isPassed
        ? 'Reinspection passed, batch and package unlocked'
        : 'Reinspection failed, package remains locked');
    } catch (error) {
      next(error);
    }
  }

  async unlockBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as UnlockBatchDto;
      const result = await sterilizationService.unlockBatch(dto, operatorId);
      return successResponse(res, result, 'Batch unlocked successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBatchById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await sterilizationService.getBatchById(id);
      return successResponse(res, result, 'Sterilization batch retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getBatches(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const packageId = req.query.packageId as string | undefined;
      const equipmentId = req.query.equipmentId as string | undefined;
      const status = req.query.status as SterilizationStatus | undefined;
      const isLocked = req.query.isLocked ? req.query.isLocked === 'true' : undefined;

      const result = await sterilizationService.getBatches(page, pageSize, {
        packageId,
        equipmentId,
        status,
        isLocked,
      });

      return paginatedResponse(res, result.batches, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getBatchRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;

      const result = await sterilizationService.getBatchRecords(batchId, page, pageSize);
      return paginatedResponse(res, result.records, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async updateBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateBatchDto;
      const result = await sterilizationService.updateBatch(id, dto);
      return successResponse(res, result, 'Sterilization batch updated');
    } catch (error) {
      next(error);
    }
  }

  async getBatchStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await sterilizationService.getBatchStats();
      return successResponse(res, result, 'Sterilization stats retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getRealTimeStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await sterilizationService.getRealTimeStatus();
      return successResponse(res, result, 'Real-time sterilization status retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const sterilizationController = new SterilizationController();
