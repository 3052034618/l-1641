import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InstrumentPackage } from './InstrumentPackage.entity';
import { SterilizationBatch } from './SterilizationBatch.entity';

@Entity('trace_tags')
export class TraceTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  tagCode: string;

  @Column({ unique: true, length: 100 })
  qrCode: string;

  @ManyToOne(() => InstrumentPackage, pkg => pkg.traceTags)
  @JoinColumn({ name: 'packageId' })
  instrumentPackage: InstrumentPackage;

  @Column()
  packageId: string;

  @ManyToOne(() => SterilizationBatch)
  @JoinColumn({ name: 'sterilizationBatchId' })
  sterilizationBatch: SterilizationBatch;

  @Column()
  sterilizationBatchId: string;

  @Column({ type: 'timestamp' })
  sterilizedAt: Date;

  @Column({ type: 'timestamp' })
  validUntil: Date;

  @Column({ length: 50 })
  sterilizerCode: string;

  @Column({ length: 50 })
  batchCode: string;

  @Column({ default: true })
  isValid: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date;

  @Column('text', { nullable: true })
  traceData: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
