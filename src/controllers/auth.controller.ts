import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { successResponse } from '../utils/response';
import { LoginDto, RegisterDto, ChangePasswordDto } from '../dtos/auth.dto';

export class AuthController {
  async login(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as LoginDto;
      const result = await authService.login(dto);
      return successResponse(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async register(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as RegisterDto;
      const result = await authService.register(dto);
      return successResponse(res, result, 'Registration successful', 201);
    } catch (error) {
      next(error);
    }
  }

  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const result = await authService.getCurrentUser(userId);
      return successResponse(res, result, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const dto = req.body as ChangePasswordDto;
      const result = await authService.changePassword(userId, dto);
      return successResponse(res, result, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPermissions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const result = await authService.getCurrentUserPermissions(userId);
      return successResponse(res, result, 'Permissions retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
