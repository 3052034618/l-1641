import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { workOrderService } from '../services/workorder.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { WorkOrderDto, UpdateWorkOrderDto, AssignWorkOrderDto } from '../dtos/cleaning.dto';
import { WorkOrderStatus, WorkOrderPriority, SterilizerType } from '../enums';
import { NotFoundError } from '../errors/CustomError';

export class WorkOrderController {
  async createWorkOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as WorkOrderDto;
      const result = await workOrderService.create(dto);
      return successResponse(res, result, 'Work order created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async assignEngineer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { engineerId } = req.body;
      const dto = { workOrderId: id, engineerId } as AssignWorkOrderDto;
      const result = await workOrderService.assign(dto);
      return successResponse(res, result, 'Work order assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  async autoAssignEngineer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.getById(id);
      if (!workOrder) {
        throw new NotFoundError('Work order not found');
      }
      const result = await workOrderService.autoAssignEngineer(workOrder);
      return successResponse(res, result ? { workOrder, assignedEngineer: result } : { workOrder, message: 'No engineers available' },
        result ? 'Work order auto-assigned successfully' : 'No engineers available for assignment');
    } catch (error) {
      next(error);
    }
  }

  async updateWorkOrder(req: AuthRequest, res: Response, next: NextFunction) {
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

  async getWorkOrderById(req: AuthRequest, res: Response, next: NextFunction) {
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
      const assignedEngineerId = req.query.assignedEngineerId as string | undefined;
      const equipmentType = req.query.equipmentType as SterilizerType | undefined;

      const result = await workOrderService.getWorkOrders(page, pageSize, {
        status,
        priority,
        equipmentId,
        assignedEngineerId,
        equipmentType,
      });

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
      const result = await workOrderService.completeWorkOrder(id, engineerId, resolution || 'Completed', actualCost);
      return successResponse(res, result, 'Work order completed');
    } catch (error) {
      next(error);
    }
  }

  async getWorkOrderStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const engineerId = req.query.engineerId as string | undefined;
      const result = await workOrderService.getWorkOrderStats(engineerId);
      return successResponse(res, result, 'Work order stats retrieved');
    } catch (error) {
      next(error);
    }
  }

  async deleteWorkOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.getById(id);
      if (!workOrder) {
        throw new NotFoundError('Work order not found');
      }
      const { WorkOrderStatus } = require('../enums');
      workOrder.status = WorkOrderStatus.CANCELLED || 'CANCELLED';
      await workOrderService.update(id, { status: WorkOrderStatus.CANCELLED || 'CANCELLED' } as any, req.user!.userId);
      return successResponse(res, null, 'Work order cancelled');
    } catch (error) {
      next(error);
    }
  }
}

export const workOrderController = new WorkOrderController();
