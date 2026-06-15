import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DepartmentZone } from '../enums';

@Entity('operation_reports')
export class OperationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  reportCode: string;

  @Column({ type: 'date' })
  reportDate: Date;

  @Column({
    type: 'enum',
    enum: DepartmentZone,
    nullable: true,
  })
  zone: DepartmentZone;

  @Column('simple-json')
  departmentStats: Array<{
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    zone: DepartmentZone;
    totalPackages: number;
    recoveredPackages: number;
    sterilizedPackages: number;
    distributedPackages: number;
    turnoverRate: number;
    averageTurnoverDays: number;
  }>;

  @Column('simple-json')
  sterilizationStats: {
    totalBatches: number;
    passedBatches: number;
    failedBatches: number;
    passRate: number;
    lockedBatches: number;
    averageDuration: number;
    averageTemperature: number;
    averagePressure: number;
    temperatureAnomalies: number;
    pressureAnomalies: number;
  };

  @Column('simple-json')
  equipmentStats: Array<{
    equipmentId: string;
    equipmentCode: string;
    equipmentName: string;
    equipmentType: string;
    totalBatches: number;
    failedBatches: number;
    failureRate: number;
    workOrders: number;
    completedWorkOrders: number;
    avgMaintenanceHours: number;
  }>;

  @Column('simple-json')
  summary: {
    totalPackages: number;
    totalRecovery: number;
    totalCleaning: number;
    totalSterilization: number;
    totalDistribution: number;
    totalExpired: number;
    totalRejected: number;
    overallPassRate: number;
    overallTurnoverRate: number;
  };

  @Column({ default: false })
  isGenerated: boolean;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt: Date;

  @Column({ default: false })
  isExported: boolean;

  @Column({ type: 'timestamp', nullable: true })
  exportedAt: Date;

  @Column({ nullable: true })
  exportedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
