import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { equipmentService } from '../services/equipment.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { CreateEquipmentDto, UpdateEquipmentDto } from '../dtos/equipment.dto';

export class EquipmentController {
  async createEquipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateEquipmentDto;
      const result = await equipmentService.createEquipment(dto);
      return successResponse(res, result, 'Equipment created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getEquipmentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await equipmentService.getEquipmentById(id);
      return successResponse(res, result, 'Equipment retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getEquipments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const type = req.query.type as string | undefined;
      const search = req.query.search as string | undefined;
      const isActive = req.query.isActive ? req.query.isActive === 'true' : undefined;

      const result = await equipmentService.getEquipments(page, pageSize, {
        type,
        search,
        isActive,
      });

      return paginatedResponse(res, result.equipments, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getEquipmentsByType(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { type } = req.params;
      const result = await equipmentService.getEquipmentsByType(type);
      return successResponse(res, result, 'Equipments retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateEquipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateEquipmentDto;
      const result = await equipmentService.updateEquipment(id, dto);
      return successResponse(res, result, 'Equipment updated');
    } catch (error) {
      next(error);
    }
  }

  async deleteEquipment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await equipmentService.deleteEquipment(id);
      return successResponse(res, null, 'Equipment deactivated');
    } catch (error) {
      next(error);
    }
  }

  async getEquipmentStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await equipmentService.getEquipmentStats();
      return successResponse(res, result, 'Equipment stats retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getEquipmentTypes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await equipmentService.getEquipmentTypes();
      return successResponse(res, result, 'Equipment types retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const equipmentController = new EquipmentController();
