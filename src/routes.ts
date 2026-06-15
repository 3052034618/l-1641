import { Router } from 'express';
import { authenticate, authorizeRoles } from './middleware/auth';

import { authController } from './controllers/auth.controller';
import { userController } from './controllers/user.controller';
import { departmentController } from './controllers/department.controller';
import { equipmentController } from './controllers/equipment.controller';
import { recoveryController } from './controllers/recovery.controller';
import { cleaningController } from './controllers/cleaning.controller';
import { workOrderController } from './controllers/workorder.controller';
import { sterilizationController } from './controllers/sterilization.controller';
import { distributionController } from './controllers/distribution.controller';
import { reportController } from './controllers/report.controller';
import { notificationController } from './controllers/notification.controller';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'CSSD Trace System API is running',
    timestamp: new Date().toISOString(),
  });
});

router.post('/api/auth/login', authController.login);
router.post('/api/auth/register', authenticate, authorizeRoles.manager, authController.register);
router.get('/api/auth/me', authenticate, authController.getCurrentUser);

router.get('/api/users', authenticate, authorizeRoles.manager, userController.getUsers);
router.get('/api/users/:id', authenticate, userController.getUserById);
router.put('/api/users/:id', authenticate, authorizeRoles.manager, userController.updateUser);
router.delete('/api/users/:id', authenticate, authorizeRoles.manager, userController.deleteUser);
router.get('/api/users/role/:role', authenticate, authorizeRoles.manager, userController.getUsersByRole);

router.get('/api/departments', authenticate, departmentController.getDepartments);
router.get('/api/departments/:id', authenticate, departmentController.getDepartmentById);
router.post('/api/departments', authenticate, authorizeRoles.manager, departmentController.createDepartment);
router.put('/api/departments/:id', authenticate, authorizeRoles.manager, departmentController.updateDepartment);
router.delete('/api/departments/:id', authenticate, authorizeRoles.manager, departmentController.deleteDepartment);
router.get('/api/departments/zone/:zone', authenticate, departmentController.getDepartmentsByZone);

router.get('/api/equipment', authenticate, equipmentController.getEquipments);
router.get('/api/equipment/:id', authenticate, equipmentController.getEquipmentById);
router.post('/api/equipment', authenticate, authorizeRoles.manager, equipmentController.createEquipment);
router.put('/api/equipment/:id', authenticate, authorizeRoles.manager, equipmentController.updateEquipment);
router.delete('/api/equipment/:id', authenticate, authorizeRoles.manager, equipmentController.deleteEquipment);
router.get('/api/equipment/type/:type', authenticate, equipmentController.getEquipmentsByType);
router.get('/api/equipment/stats', authenticate, equipmentController.getEquipmentStats);

router.post('/api/recovery/packages', authenticate, authorizeRoles.disinfection, recoveryController.createPackage);
router.post('/api/recovery/scan', authenticate, authorizeRoles.disinfection, recoveryController.scanBarcode);
router.post('/api/recovery/inspect', authenticate, authorizeRoles.disinfection, recoveryController.inspectAndRecover);
router.post('/api/recovery/reject', authenticate, authorizeRoles.disinfection, recoveryController.rejectPackage);
router.get('/api/recovery/packages', authenticate, recoveryController.getPackages);
router.get('/api/recovery/packages/:id', authenticate, recoveryController.getPackageById);
router.get('/api/recovery/packages/barcode/:barcode', authenticate, recoveryController.getPackageByBarcode);
router.get('/api/recovery/records', authenticate, recoveryController.getRecoveryRecords);
router.get('/api/recovery/records/:id', authenticate, recoveryController.getRecoveryRecordById);
router.put('/api/recovery/packages/:id', authenticate, authorizeRoles.disinfection, recoveryController.updatePackage);
router.get('/api/recovery/stats', authenticate, recoveryController.getRecoveryStats);
router.get('/api/recovery/templates', authenticate, recoveryController.getTemplates);
router.post('/api/recovery/templates', authenticate, authorizeRoles.manager, recoveryController.createTemplate);

router.post('/api/cleaning/tasks', authenticate, authorizeRoles.disinfection, cleaningController.createTask);
router.put('/api/cleaning/tasks/:id/start', authenticate, authorizeRoles.disinfection, cleaningController.startTask);
router.put('/api/cleaning/tasks/:id/complete', authenticate, authorizeRoles.disinfection, cleaningController.completeTask);
router.get('/api/cleaning/tasks', authenticate, cleaningController.getTasks);
router.get('/api/cleaning/tasks/:id', authenticate, cleaningController.getTaskById);
router.get('/api/cleaning/programs', authenticate, cleaningController.getCleaningPrograms);
router.get('/api/cleaning/stats', authenticate, cleaningController.getCleaningStats);

router.get('/api/workorders', authenticate, workOrderController.getWorkOrders);
router.get('/api/workorders/:id', authenticate, workOrderController.getWorkOrderById);
router.post('/api/workorders', authenticate, authorizeRoles.manager, workOrderController.createWorkOrder);
router.put('/api/workorders/:id', authenticate, workOrderController.updateWorkOrder);
router.put('/api/workorders/:id/assign', authenticate, authorizeRoles.manager, workOrderController.assignEngineer);
router.put('/api/workorders/:id/auto-assign', authenticate, authorizeRoles.manager, workOrderController.autoAssignEngineer);
router.put('/api/workorders/:id/start', authenticate, workOrderController.startWorkOrder);
router.put('/api/workorders/:id/complete', authenticate, workOrderController.completeWorkOrder);
router.get('/api/workorders/stats', authenticate, workOrderController.getWorkOrderStats);
router.delete('/api/workorders/:id', authenticate, authorizeRoles.manager, workOrderController.deleteWorkOrder);

router.post('/api/sterilization/batches', authenticate, authorizeRoles.disinfection, sterilizationController.createBatch);
router.post('/api/sterilization/batches/start', authenticate, authorizeRoles.disinfection, sterilizationController.startBatch);
router.post('/api/sterilization/data', authenticate, authorizeRoles.disinfection, sterilizationController.submitData);
router.post('/api/sterilization/batches/complete', authenticate, authorizeRoles.disinfection, sterilizationController.completeBatch);
router.post('/api/sterilization/batches/reinspect', authenticate, authorizeRoles.manager, sterilizationController.reinspectBatch);
router.post('/api/sterilization/batches/unlock', authenticate, authorizeRoles.manager, sterilizationController.unlockBatch);
router.get('/api/sterilization/batches/:id', authenticate, sterilizationController.getBatchById);
router.get('/api/sterilization/batches', authenticate, sterilizationController.getBatches);
router.get('/api/sterilization/batches/:batchId/records', authenticate, sterilizationController.getBatchRecords);
router.get('/api/sterilization/stats', authenticate, sterilizationController.getBatchStats);
router.get('/api/sterilization/realtime', authenticate, sterilizationController.getRealTimeStatus);

router.post('/api/distribution/verify', authenticate, authorizeRoles.nurse, distributionController.verifyPackage);
router.get('/api/distribution/verify/barcode/:barcode', authenticate, authorizeRoles.nurse, distributionController.verifyPackageByBarcode);
router.post('/api/distribution', authenticate, authorizeRoles.nurse, distributionController.createDistribution);
router.post('/api/distribution/scan-tag', authenticate, authorizeRoles.nurse, distributionController.scanTag);
router.post('/api/distribution/confirm', authenticate, authorizeRoles.nurse, distributionController.confirmReceipt);
router.post('/api/distribution/check-expired', authenticate, authorizeRoles.manager, reportController.checkExpiredPackages);
router.get('/api/distribution/:id', authenticate, distributionController.getDistributionById);
router.get('/api/distribution', authenticate, distributionController.getDistributions);
router.put('/api/distribution/:id', authenticate, authorizeRoles.nurse, distributionController.updateDistribution);
router.get('/api/distribution/tags/:id', authenticate, distributionController.getTagById);
router.get('/api/distribution/tags', authenticate, distributionController.getTags);
router.get('/api/distribution/stats', authenticate, distributionController.getStats);
router.get('/api/distribution/ready', authenticate, distributionController.getReadyPackages);

router.post('/api/reports', authenticate, authorizeRoles.manager, reportController.generateReport);
router.get('/api/reports/:id', authenticate, reportController.getReportById);
router.get('/api/reports', authenticate, reportController.getReports);
router.get('/api/reports/export', authenticate, reportController.exportReport);
router.get('/api/reports/stats', authenticate, reportController.getStats);

router.get('/api/notifications', authenticate, notificationController.getNotifications);
router.get('/api/notifications/unread', authenticate, notificationController.getUnreadCount);
router.put('/api/notifications/:id/read', authenticate, notificationController.markAsRead);
router.put('/api/notifications/read-all', authenticate, notificationController.markAllAsRead);
router.get('/api/notifications/:id', authenticate, notificationController.getNotificationById);

export default router;
