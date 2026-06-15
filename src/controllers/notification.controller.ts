import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import { successResponse, paginatedResponse, successResponseWithMessage } from '../utils/response';

export class NotificationController {
  async getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const isRead = req.query.isRead ? req.query.isRead === 'true' : undefined;

      const result = await notificationService.getUserNotifications(userId, page, pageSize, isRead);
      return paginatedResponse(res, result.notifications, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const notificationId = req.params.id;

      const result = await notificationService.markAsRead(notificationId, userId);
      return successResponse(res, result, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const result = await notificationService.markAllAsRead(userId);
      return successResponse(res, result, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;

      const result = await notificationService.getUnreadCount(userId);
      return successResponse(res, result, 'Unread count retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
