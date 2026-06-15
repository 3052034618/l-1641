import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { workOrderService } from '../services/workorder.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { WorkOrderDto, UpdateWorkOrderDto, AssignWorkOrderDto } from '../dtos/cleaning.dto';
import { WorkOrderStatus, WorkOrderPriority, SterilizerType } from '../enums';

export class WorkOrderController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as WorkOrderDto;
      const result = await workOrderService.create(dto);
      return successResponse(res, result, 'Work order created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async assign(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as AssignWorkOrderDto;
      const result = await workOrderService.assign(dto);
      return successResponse(res, result, 'Work order assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const dto = req.body as UpdateWorkOrderDto;
      const result = await workOrderService.update(id, dto, userId);
      return successResponse(res, result, 'Work order updated');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await workOrderService.getById(id);
      return successResponse(res, result, 'Work order retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getWorkOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const status = req.query.status as WorkOrderStatus | undefined;
      const priority = req.query.priority as WorkOrderPriority | undefined;
      const equipmentId = req.query.equipmentId as string | undefined;
      const equipmentType = req.query.equipmentType as SterilizerType | undefined;

      const result = await workOrderService.getWorkOrders(page, pageSize, {
        status,
        priority,
        equipmentId,
        equipmentType,
      });

      return paginatedResponse(res, result.workOrders, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getMyWorkOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const engineerId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await workOrderService.getEngineerWorkOrders(engineerId, page, pageSize);
      return paginatedResponse(res, result.workOrders, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async startWorkOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const engineerId = req.user!.userId;
      const { id } = req.params;
      const result = await workOrderService.startWorkOrder(id, engineerId);
      return successResponse(res, result, 'Work order started');
    } catch (error) {
      next(error);
    }
  }

  async completeWorkOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const engineerId = req.user!.userId;
      const { id } = req.params;
      const { resolution, actualCost } = req.body;
      const result = await workOrderService.completeWorkOrder(id, engineerId, resolution, actualCost);
      return successResponse(res, result, 'Work order completed');
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const engineerId = req.query.engineerId as string | undefined;
      const result = await workOrderService.getWorkOrderStats(engineerId);
      return successResponse(res, result, 'Work order stats retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const workOrderController = new WorkOrderController();
