export enum UserRole {
  ADMIN = 'admin',
  CSSD_MANAGER = 'cssd_manager',
  DISINFECTION_WORKER = 'disinfection_worker',
  NURSE = 'nurse',
  ENGINEER = 'engineer',
}

export enum DepartmentZone {
  INPATIENT = 'inpatient',
  OUTPATIENT = 'outpatient',
  EMERGENCY = 'emergency',
  SURGERY = 'surgery',
  ICU = 'icu',
  PEDIATRICS = 'pediatrics',
}

export enum PackageStatus {
  CREATED = 'created',
  RECEIVED = 'received',
  CLEANING = 'cleaning',
  CLEANED = 'cleaned',
  STERILIZING = 'sterilizing',
  STERILIZED = 'sterilized',
  READY = 'ready',
  DISTRIBUTED = 'distributed',
  USED = 'used',
  RETURNED = 'returned',
  REJECTED = 'rejected',
  LOCKED = 'locked',
  EXPIRED = 'expired',
}

export enum ContaminationLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum CleaningProgram {
  STANDARD = 'standard',
  ENHANCED = 'enhanced',
  INTENSIVE = 'intensive',
  SPECIAL = 'special',
}

export enum SterilizerType {
  AUTOCLAVE = 'autoclave',
  EO_GAS = 'eo_gas',
  PLASMA = 'plasma',
  DRY_HEAT = 'dry_heat',
}

export enum SterilizationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

export enum WorkOrderStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CLOSED = 'closed',
}

export enum WorkOrderPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum EquipmentStatus {
  OPERATIONAL = 'operational',
  MAINTENANCE = 'maintenance',
  FAULTY = 'faulty',
  OUT_OF_SERVICE = 'out_of_service',
}

export enum NotificationType {
  PACKAGE_REJECTED = 'package_rejected',
  CLEANING_COMPLETE = 'cleaning_complete',
  STERILIZATION_ALERT = 'sterilization_alert',
  PACKAGE_EXPIRED = 'package_expired',
  WORK_ORDER_ASSIGNED = 'work_order_assigned',
  REPORT_GENERATED = 'report_generated',
  STATUS_CHANGE = 'status_change',
}

export enum NotificationChannel {
  SOCKET = 'socket',
  EMAIL = 'email',
  SMS = 'sms',
  APP = 'app',
}
