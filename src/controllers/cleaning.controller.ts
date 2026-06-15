import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { cleaningService } from '../services/cleaning.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { CreateCleaningTaskDto, StartCleaningTaskDto, CompleteCleaningTaskDto, UpdateCleaningTaskDto } from '../dtos/cleaning.dto';
import { CleaningProgram } from '../enums';

export class CleaningController {
  async createTask(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as CreateCleaningTaskDto;
      const result = await cleaningService.createTask(dto, operatorId);
      return successResponse(res, result, 'Cleaning task created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async startTask(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as StartCleaningTaskDto;
      const result = await cleaningService.startTask(dto, operatorId);
      return successResponse(res, result, 'Cleaning task started');
    } catch (error) {
      next(error);
    }
  }

  async completeTask(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const operatorId = req.user!.userId;
      const dto = req.body as CompleteCleaningTaskDto;
      const result = await cleaningService.completeTask(dto, operatorId);
      return successResponse(res, result, result.parameterAnomalies.length > 0
        ? 'Cleaning task completed with anomalies, work order generated'
        : 'Cleaning task completed successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTaskById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await cleaningService.getTaskById(id);
      return successResponse(res, result, 'Cleaning task retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getTasks(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const packageId = req.query.packageId as string | undefined;
      const isCompleted = req.query.isCompleted ? req.query.isCompleted === 'true' : undefined;
      const hasAnomalies = req.query.hasAnomalies ? req.query.hasAnomalies === 'true' : undefined;
      const operatorId = req.query.operatorId as string | undefined;
      const program = req.query.program as CleaningProgram | undefined;

      const result = await cleaningService.getTasks(page, pageSize, {
        packageId,
        isCompleted,
        hasAnomalies,
        operatorId,
        program,
      });

      return paginatedResponse(res, result.tasks, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async updateTask(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateCleaningTaskDto;
      const result = await cleaningService.updateTask(id, dto);
      return successResponse(res, result, 'Cleaning task updated');
    } catch (error) {
      next(error);
    }
  }

  async getCleaningPrograms(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await cleaningService.getProgramConfigs();
      return successResponse(res, result, 'Cleaning program configs retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getCleaningStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await cleaningService.getTaskStats();
      return successResponse(res, result, 'Cleaning task stats retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const cleaningController = new CleaningController();
