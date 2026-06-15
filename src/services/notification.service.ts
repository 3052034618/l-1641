import { Repository } from 'typeorm';
import { Notification } from '../entities';
import { AppDataSource } from '../data-source';
import { webSocketServer } from '../sockets/WebSocketServer';
import { NotificationType, NotificationChannel, UserRole } from '../enums';
import logger from '../config/logger';

export interface CreateNotificationDto {
  userId?: string;
  targetRole?: UserRole;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  content: string;
  relatedData?: {
    entityType: string;
    entityId: string;
    entityCode: string;
    additionalInfo?: Record<string, any>;
  };
}

export class NotificationService {
  private notificationRepository: Repository<Notification>;

  constructor() {
    this.notificationRepository = AppDataSource.getRepository(Notification);
  }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...dto,
      channel: dto.channel || NotificationChannel.SOCKET,
    });

    await this.notificationRepository.save(notification);
    logger.info(`Notification created: ${dto.type} - ${dto.title}`);

    if (dto.channel === NotificationChannel.SOCKET) {
      await this.pushNotification(notification);
    }

    return notification;
  }

  private async pushNotification(notification: Notification) {
    const eventName = this.getEventName(notification.type);
    const data = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      relatedData: notification.relatedData,
      createdAt: notification.createdAt,
    };

    let sentTo: string[] = [];

    if (notification.userId) {
      const success = webSocketServer.sendToUser(notification.userId, eventName, data);
      if (success) {
        sentTo = [notification.userId];
      }
    } else if (notification.targetRole) {
      sentTo = webSocketServer.sendToRole(notification.targetRole, eventName, data);
    }

    if (sentTo.length > 0) {
      notification.isSent = true;
      notification.sentAt = new Date();
      await this.notificationRepository.save(notification);
      logger.info(`Notification pushed to ${sentTo.length} clients`);
    }
  }

  private getEventName(type: NotificationType): string {
    const eventMap: Record<NotificationType, string> = {
      [NotificationType.PACKAGE_REJECTED]: 'package_rejected',
      [NotificationType.CLEANING_COMPLETE]: 'cleaning_complete',
      [NotificationType.STERILIZATION_ALERT]: 'sterilization_alert',
      [NotificationType.PACKAGE_EXPIRED]: 'package_expired',
      [NotificationType.WORK_ORDER_ASSIGNED]: 'work_order_assigned',
      [NotificationType.REPORT_GENERATED]: 'report_generated',
      [NotificationType.STATUS_CHANGE]: 'status_change',
    };
    return eventMap[type] || 'notification';
  }

  async notifyPackageRejected(packageId: string, packageBarcode: string, departmentId: string, rejectionReason: string) {
    return this.create({
      targetRole: UserRole.NURSE,
      type: NotificationType.PACKAGE_REJECTED,
      title: '器械包回收被退回',
      content: `器械包 ${packageBarcode} 回收检验不通过，原因：${rejectionReason}。请检查并重新整理。`,
      relatedData: {
        entityType: 'InstrumentPackage',
        entityId: packageId,
        entityCode: packageBarcode,
        additionalInfo: {
          departmentId,
          rejectionReason,
        },
      },
    });
  }

  async notifyCleaningComplete(taskId: string, packageBarcode: string, hasAnomalies: boolean) {
    return this.create({
      targetRole: UserRole.DISINFECTION_WORKER,
      type: NotificationType.CLEANING_COMPLETE,
      title: hasAnomalies ? '清洗任务完成（存在异常）' : '清洗任务完成',
      content: hasAnomalies
        ? `器械包 ${packageBarcode} 清洗完成，但运行参数存在异常，已自动生成维修工单。`
        : `器械包 ${packageBarcode} 清洗完成，可进入灭菌流程。`,
      relatedData: {
        entityType: 'CleaningTask',
        entityId: taskId,
        entityCode: packageBarcode,
        additionalInfo: { hasAnomalies },
      },
    });
  }

  async notifySterilizationAlert(batchId: string, batchCode: string, packageBarcode: string, alertType: 'temperature' | 'pressure', value: number, expectedRange: string) {
    const rolesToNotify: UserRole[] = [UserRole.CSSD_MANAGER, UserRole.DISINFECTION_WORKER];
    const notifications: Notification[] = [];

    for (const role of rolesToNotify) {
      const notification = await this.create({
        targetRole: role,
        type: NotificationType.STERILIZATION_ALERT,
        title: '灭菌参数超标警报',
        content: `灭菌批次 ${batchCode}（器械包：${packageBarcode}）${alertType === 'temperature' ? '温度' : '压力'}超标。当前值：${value}，正常范围：${expectedRange}。该批次已被锁定，请及时处理。`,
        relatedData: {
          entityType: 'SterilizationBatch',
          entityId: batchId,
          entityCode: batchCode,
          additionalInfo: {
            packageBarcode,
            alertType,
            value,
            expectedRange,
          },
        },
      });
      notifications.push(notification);
    }

    return notifications;
  }

  async notifyPackageExpired(packageId: string, packageBarcode: string, departmentId: string, daysExpired: number) {
    return this.create({
      targetRole: UserRole.NURSE,
      type: NotificationType.PACKAGE_EXPIRED,
      title: '器械包过期提醒',
      content: `器械包 ${packageBarcode} 已过期 ${daysExpired} 天，已被锁定，禁止发放。请联系消毒供应中心处理。`,
      relatedData: {
        entityType: 'InstrumentPackage',
        entityId: packageId,
        entityCode: packageBarcode,
        additionalInfo: {
          departmentId,
          daysExpired,
        },
      },
    });
  }

  async notifyWorkOrderAssigned(workOrderId: string, orderCode: string, engineerId: string, equipmentName: string, priority: string) {
    return this.create({
      userId: engineerId,
      type: NotificationType.WORK_ORDER_ASSIGNED,
      title: '新维修工单已分配',
      content: `您有新的维修工单 ${orderCode}，设备：${equipmentName}，优先级：${priority}。请及时处理。`,
      relatedData: {
        entityType: 'WorkOrder',
        entityId: workOrderId,
        entityCode: orderCode,
        additionalInfo: {
          engineerId,
          equipmentName,
          priority,
        },
      },
    });
  }

  async notifyReportGenerated(reportId: string, reportCode: string, reportDate: Date) {
    return this.create({
      targetRole: UserRole.CSSD_MANAGER,
      type: NotificationType.REPORT_GENERATED,
      title: '每日运营报表已生成',
      content: `${reportDate.toISOString().split('T')[0]} 的运营报表已生成，可在报表中心查看。`,
      relatedData: {
        entityType: 'OperationReport',
        entityId: reportId,
        entityCode: reportCode,
        additionalInfo: {
          reportDate,
        },
      },
    });
  }

  async notifyStatusChange(entityType: string, entityId: string, entityCode: string, oldStatus: string, newStatus: string) {
    const rolesToNotify: UserRole[] = [
      UserRole.CSSD_MANAGER,
      UserRole.DISINFECTION_WORKER,
      UserRole.NURSE,
    ];
    const notifications: Notification[] = [];

    for (const role of rolesToNotify) {
      const notification = await this.create({
        targetRole: role,
        type: NotificationType.STATUS_CHANGE,
        title: '状态变更通知',
        content: `${entityType} ${entityCode} 状态已从 ${oldStatus} 变更为 ${newStatus}。`,
        relatedData: {
          entityType,
          entityId,
          entityCode,
          additionalInfo: {
            oldStatus,
            newStatus,
          },
        },
      });
      notifications.push(notification);
    }

    webSocketServer.broadcastStatusChange(entityType, entityId, oldStatus, newStatus, {
      entityCode,
    });

    return notifications;
  }

  async getUserNotifications(userId: string, page: number = 1, pageSize: number = 20, isRead?: boolean) {
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId OR notification.targetRole IS NOT NULL', { userId });

    if (isRead !== undefined) {
      queryBuilder.andWhere('notification.isRead = :isRead', { isRead });
    }

    const [notifications, total] = await queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { notifications, total };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where('userId = :userId AND isRead = :isRead', { userId, isRead: false })
      .execute();

    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationRepository.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount: count };
  }
}

export const notificationService = new NotificationService();
