import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { PackageStatus, ContaminationLevel } from '../enums';
import { Department } from './Department.entity';
import { PackageTemplate } from './PackageTemplate.entity';
import { RecoveryRecord } from './RecoveryRecord.entity';
import { CleaningTask } from './CleaningTask.entity';
import { SterilizationBatch } from './SterilizationBatch.entity';
import { DistributionRecord } from './DistributionRecord.entity';
import { TraceTag } from './TraceTag.entity';

@Entity('instrument_packages')
export class InstrumentPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  barcode: string;

  @Column({ length: 100 })
  name: string;

  @ManyToOne(() => Department, department => department.packages)
  @JoinColumn({ name: 'departmentId' })
  department: Department;

  @Column()
  departmentId: string;

  @ManyToOne(() => PackageTemplate, { nullable: true })
  @JoinColumn({ name: 'templateId' })
  template: PackageTemplate;

  @Column({ nullable: true })
  templateId: string;

  @Column({
    type: 'enum',
    enum: PackageStatus,
    default: PackageStatus.CREATED,
  })
  status: PackageStatus;

  @Column({
    type: 'enum',
    enum: ContaminationLevel,
    default: ContaminationLevel.MEDIUM,
  })
  contaminationLevel: ContaminationLevel;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ nullable: true })
  lockReason: string;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  sterilizedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  validUntil: Date;

  @Column('simple-json', { nullable: true })
  instrumentItems: Array<{
    instrumentId: string;
    instrumentCode: string;
    instrumentName: string;
    expectedQuantity: number;
    actualQuantity: number;
    status: 'normal' | 'missing' | 'damaged';
  }>;

  @OneToMany(() => RecoveryRecord, record => record.instrumentPackage)
  recoveryRecords: RecoveryRecord[];

  @OneToMany(() => CleaningTask, task => task.instrumentPackage)
  cleaningTasks: CleaningTask[];

  @OneToMany(() => SterilizationBatch, batch => batch.instrumentPackage)
  sterilizationBatches: SterilizationBatch[];

  @OneToMany(() => DistributionRecord, record => record.instrumentPackage)
  distributionRecords: DistributionRecord[];

  @OneToMany(() => TraceTag, tag => tag.instrumentPackage)
  traceTags: TraceTag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
