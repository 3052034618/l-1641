import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { departmentService } from '../services/department.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dtos/department.dto';

export class DepartmentController {
  async createDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateDepartmentDto;
      const result = await departmentService.createDepartment(dto);
      return successResponse(res, result, 'Department created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getDepartmentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await departmentService.getDepartmentById(id);
      return successResponse(res, result, 'Department retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getDepartments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const zone = req.query.zone as string | undefined;
      const search = req.query.search as string | undefined;
      const isActive = req.query.isActive ? req.query.isActive === 'true' : undefined;

      const result = await departmentService.getDepartments(page, pageSize, {
        zone,
        search,
        isActive,
      });

      return paginatedResponse(res, result.departments, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getDepartmentsByZone(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { zone } = req.params;
      const result = await departmentService.getDepartmentsByZone(zone);
      return successResponse(res, result, 'Departments retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateDepartmentDto;
      const result = await departmentService.updateDepartment(id, dto);
      return successResponse(res, result, 'Department updated');
    } catch (error) {
      next(error);
    }
  }

  async deleteDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await departmentService.deleteDepartment(id);
      return successResponse(res, null, 'Department deactivated');
    } catch (error) {
      next(error);
    }
  }

  async getZones(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await departmentService.getZones();
      return successResponse(res, result, 'Zones retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getDepartmentStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await departmentService.getDepartmentStats();
      return successResponse(res, result, 'Department stats retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const departmentController = new DepartmentController();
