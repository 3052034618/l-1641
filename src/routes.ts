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

router.post('/auth/login', authController.login);
router.post('/auth/register', authenticate, authorizeRoles.manager, authController.register);
router.get('/auth/me', authenticate, authController.getCurrentUser);

router.get('/users', authenticate, authorizeRoles.manager, userController.getUsers);
router.get('/users/:id', authenticate, userController.getUserById);
router.put('/users/:id', authenticate, authorizeRoles.manager, userController.updateUser);
router.delete('/users/:id', authenticate, authorizeRoles.manager, userController.deleteUser);
router.get('/users/role/:role', authenticate, authorizeRoles.manager, userController.getUsersByRole);

router.get('/departments', authenticate, departmentController.getDepartments);
router.get('/departments/:id', authenticate, departmentController.getDepartmentById);
router.post('/departments', authenticate, authorizeRoles.manager, departmentController.createDepartment);
router.put('/departments/:id', authenticate, authorizeRoles.manager, departmentController.updateDepartment);
router.delete('/departments/:id', authenticate, authorizeRoles.manager, departmentController.deleteDepartment);
router.get('/departments/zone/:zone', authenticate, departmentController.getDepartmentsByZone);

router.get('/equipment', authenticate, equipmentController.getEquipments);
router.get('/equipment/:id', authenticate, equipmentController.getEquipmentById);
router.post('/equipment', authenticate, authorizeRoles.manager, equipmentController.createEquipment);
router.put('/equipment/:id', authenticate, authorizeRoles.manager, equipmentController.updateEquipment);
router.delete('/equipment/:id', authenticate, authorizeRoles.manager, equipmentController.deleteEquipment);
router.get('/equipment/type/:type', authenticate, equipmentController.getEquipmentsByType);
router.get('/equipment/stats', authenticate, equipmentController.getEquipmentStats);

router.post('/recovery/packages', authenticate, authorizeRoles.disinfection, recoveryController.createPackage);
router.post('/recovery/scan', authenticate, authorizeRoles.disinfection, recoveryController.scanBarcode);
router.post('/recovery/inspect', authenticate, authorizeRoles.disinfection, recoveryController.inspectAndRecover);
router.post('/recovery/reject', authenticate, authorizeRoles.disinfection, recoveryController.rejectPackage);
router.get('/recovery/packages', authenticate, recoveryController.getPackages);
router.get('/recovery/packages/:id', authenticate, recoveryController.getPackageById);
router.get('/recovery/packages/barcode/:barcode', authenticate, recoveryController.getPackageByBarcode);
router.get('/recovery/records', authenticate, recoveryController.getRecoveryRecords);
router.get('/recovery/records/:id', authenticate, recoveryController.getRecoveryRecordById);
router.put('/recovery/packages/:id', authenticate, authorizeRoles.disinfection, recoveryController.updatePackage);
router.get('/recovery/stats', authenticate, recoveryController.getRecoveryStats);
router.get('/recovery/templates', authenticate, recoveryController.getTemplates);
router.post('/recovery/templates', authenticate, authorizeRoles.manager, recoveryController.createTemplate);

router.post('/cleaning/tasks', authenticate, authorizeRoles.disinfection, cleaningController.createTask);
router.put('/cleaning/tasks/:id/start', authenticate, authorizeRoles.disinfection, cleaningController.startTask);
router.put('/cleaning/tasks/:id/complete', authenticate, authorizeRoles.disinfection, cleaningController.completeTask);
router.get('/cleaning/tasks', authenticate, cleaningController.getTasks);
router.get('/cleaning/tasks/:id', authenticate, cleaningController.getTaskById);
router.get('/cleaning/programs', authenticate, cleaningController.getCleaningPrograms);
router.get('/cleaning/stats', authenticate, cleaningController.getCleaningStats);

router.get('/workorders', authenticate, workOrderController.getWorkOrders);
router.get('/workorders/:id', authenticate, workOrderController.getWorkOrderById);
router.post('/workorders', authenticate, authorizeRoles.manager, workOrderController.createWorkOrder);
router.put('/workorders/:id', authenticate, workOrderController.updateWorkOrder);
router.put('/workorders/:id/assign', authenticate, authorizeRoles.manager, workOrderController.assignEngineer);
router.put('/workorders/:id/auto-assign', authenticate, authorizeRoles.manager, workOrderController.autoAssignEngineer);
router.put('/workorders/:id/start', authenticate, workOrderController.startWorkOrder);
router.put('/workorders/:id/complete', authenticate, workOrderController.completeWorkOrder);
router.get('/workorders/stats', authenticate, workOrderController.getWorkOrderStats);
router.delete('/workorders/:id', authenticate, authorizeRoles.manager, workOrderController.deleteWorkOrder);

router.post('/sterilization/batches', authenticate, authorizeRoles.disinfection, sterilizationController.createBatch);
router.post('/sterilization/batches/start', authenticate, authorizeRoles.disinfection, sterilizationController.startBatch);
router.post('/sterilization/data', authenticate, authorizeRoles.disinfection, sterilizationController.submitData);
router.post('/sterilization/batches/complete', authenticate, authorizeRoles.disinfection, sterilizationController.completeBatch);
router.post('/sterilization/batches/reinspect', authenticate, authorizeRoles.manager, sterilizationController.reinspectBatch);
router.post('/sterilization/batches/unlock', authenticate, authorizeRoles.manager, sterilizationController.unlockBatch);
router.get('/sterilization/batches/:id', authenticate, sterilizationController.getBatchById);
router.get('/sterilization/batches', authenticate, sterilizationController.getBatches);
router.get('/sterilization/batches/:batchId/records', authenticate, sterilizationController.getBatchRecords);
router.get('/sterilization/stats', authenticate, sterilizationController.getBatchStats);
router.get('/sterilization/realtime', authenticate, sterilizationController.getRealTimeStatus);

router.post('/distribution/verify', authenticate, authorizeRoles.nurse, distributionController.verifyPackage);
router.get('/distribution/verify/barcode/:barcode', authenticate, authorizeRoles.nurse, distributionController.verifyPackageByBarcode);
router.post('/distribution', authenticate, authorizeRoles.nurse, distributionController.createDistribution);
router.post('/distribution/scan-tag', authenticate, authorizeRoles.nurse, distributionController.scanTag);
router.post('/distribution/confirm', authenticate, authorizeRoles.nurse, distributionController.confirmReceipt);
router.post('/distribution/check-expired', authenticate, authorizeRoles.manager, reportController.checkExpiredPackages);
router.get('/distribution/:id', authenticate, distributionController.getDistributionById);
router.get('/distribution', authenticate, distributionController.getDistributions);
router.put('/distribution/:id', authenticate, authorizeRoles.nurse, distributionController.updateDistribution);
router.get('/distribution/tags/:id', authenticate, distributionController.getTagById);
router.get('/distribution/tags', authenticate, distributionController.getTags);
router.get('/distribution/stats', authenticate, distributionController.getStats);
router.get('/distribution/ready', authenticate, distributionController.getReadyPackages);

router.post('/reports', authenticate, authorizeRoles.manager, reportController.generateReport);
router.get('/reports/:id', authenticate, reportController.getReportById);
router.get('/reports', authenticate, reportController.getReports);
router.get('/reports/export', authenticate, reportController.exportReport);
router.get('/reports/stats', authenticate, reportController.getStats);

router.get('/notifications', authenticate, notificationController.getNotifications);
router.get('/notifications/unread', authenticate, notificationController.getUnreadCount);
router.put('/notifications/:id/read', authenticate, notificationController.markAsRead);
router.put('/notifications/read-all', authenticate, notificationController.markAllAsRead);
router.get('/notifications/:id', authenticate, notificationController.getNotificationById);

export default router;
