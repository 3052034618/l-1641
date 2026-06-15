import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { SterilizationStatus } from '../enums';
import { InstrumentPackage } from './InstrumentPackage.entity';
import { Equipment } from './Equipment.entity';
import { User } from './User.entity';
import { SterilizationRecord } from './SterilizationRecord.entity';

@Entity('sterilization_batches')
export class SterilizationBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  batchCode: string;

  @ManyToOne(() => Equipment, equipment => equipment.sterilizationBatches)
  @JoinColumn({ name: 'equipmentId' })
  equipment: Equipment;

  @Column()
  equipmentId: string;

  @ManyToOne(() => InstrumentPackage, pkg => pkg.sterilizationBatches)
  @JoinColumn({ name: 'packageId' })
  instrumentPackage: InstrumentPackage;

  @Column()
  packageId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'operatorId' })
  operator: User;

  @Column()
  operatorId: string;

  @Column({
    type: 'enum',
    enum: SterilizationStatus,
    default: SterilizationStatus.PENDING,
  })
  status: SterilizationStatus;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ nullable: true })
  lockReason: string;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt: Date;

  @Column({ default: false })
  isReinspected: boolean;

  @Column({ type: 'timestamp', nullable: true })
  reinspectedAt: Date;

  @Column({ default: 0 })
  cycleCount: number;

  @OneToMany(() => SterilizationRecord, record => record.batch, { cascade: true })
  monitoringRecords: SterilizationRecord[];

  @Column('simple-json', { nullable: true })
  finalResult: {
    averageTemperature: number;
    averagePressure: number;
    totalDuration: number;
    temperatureAnomalies: number;
    pressureAnomalies: number;
    isPassed: boolean;
    failedReason: string;
  };

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
