import { IsString, IsOptional, IsDateString } from 'class-validator';

export class GenerateReportDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  zone?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;
}

export class ExportReportDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  zone?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  format?: 'excel' | 'csv' = 'excel';
}

export interface DepartmentStats {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  zone: string;
  totalPackages: number;
  recycledCount: number;
  cleanedCount: number;
  sterilizedCount: number;
  distributedCount: number;
  turnoverRate: number;
  avgTurnaroundTime: number;
  rejectedCount: number;
  rejectionRate: number;
}

export interface SterilizationStats {
  totalBatches: number;
  passedBatches: number;
  failedBatches: number;
  passRate: number;
  avgCycleTime: number;
  anomalyCount: number;
  lockedBatches: number;
  averageTemperature: number;
  averagePressure: number;
}

export interface EquipmentStats {
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  equipmentType: string;
  totalRuns: number;
  failureCount: number;
  failureRate: number;
  avgRunTime: number;
  maintenanceCount: number;
  avgMaintenanceTime: number;
  uptime: number;
}

export interface DailyReportData {
  reportDate: string;
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
  };
  departmentStats: DepartmentStats[];
  sterilizationStats: SterilizationStats;
  equipmentStats: EquipmentStats[];
  summary: {
    totalPackagesProcessed: number;
    totalRecycled: number;
    totalSterilized: number;
    totalDistributed: number;
    avgTurnoverRate: number;
    overallSterilizationPassRate: number;
    overallEquipmentFailureRate: number;
  };
}
