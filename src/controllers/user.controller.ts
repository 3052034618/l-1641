import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { userService } from '../services/user.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { CreateUserDto, UpdateUserDto } from '../dtos/user.dto';

export class UserController {
  async createUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as CreateUserDto;
      const result = await userService.createUser(dto);
      return successResponse(res, result, 'User created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await userService.getUserById(id);
      return successResponse(res, result, 'User retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const role = req.query.role as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await userService.getUsers(page, pageSize, {
        role,
        departmentId,
        search,
      });

      return paginatedResponse(res, result.users, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async getUsersByRole(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { role } = req.params;
      const result = await userService.getUsersByRole(role);
      return successResponse(res, result, 'Users retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = req.body as UpdateUserDto;
      const result = await userService.updateUser(id, dto);
      return successResponse(res, result, 'User updated');
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await userService.deleteUser(id);
      return successResponse(res, null, 'User deactivated');
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
