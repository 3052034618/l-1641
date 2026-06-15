import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SterilizationBatch } from './SterilizationBatch.entity';

@Entity('sterilization_records')
export class SterilizationRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SterilizationBatch, batch => batch.monitoringRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: SterilizationBatch;

  @Column()
  batchId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  recordTime: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  temperature: number;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  pressure: number;

  @Column({ default: false })
  isTemperatureAbnormal: boolean;

  @Column({ default: false })
  isPressureAbnormal: boolean;

  @Column('simple-json', { nullable: true })
  anomalyDetails: {
    temperatureStatus: 'normal' | 'over' | 'under';
    pressureStatus: 'normal' | 'over' | 'under';
    expectedTempRange: string;
    expectedPressureRange: string;
  };

  @CreateDateColumn()
  createdAt: Date;
}
