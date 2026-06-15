import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InstrumentPackage } from './InstrumentPackage.entity';
import { User } from './User.entity';

@Entity('recovery_records')
export class RecoveryRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InstrumentPackage, pkg => pkg.recoveryRecords)
  @JoinColumn({ name: 'packageId' })
  instrumentPackage: InstrumentPackage;

  @Column()
  packageId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'operatorId' })
  operator: User;

  @Column()
  operatorId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  recoveredAt: Date;

  @Column({ default: false })
  isComplete: boolean;

  @Column('simple-json', { nullable: true })
  inspectionResult: {
    missingItems: Array<{
      instrumentId: string;
      instrumentCode: string;
      instrumentName: string;
      expectedQuantity: number;
      actualQuantity: number;
      missingQuantity: number;
    }>;
    damagedItems: Array<{
      instrumentId: string;
      instrumentCode: string;
      instrumentName: string;
      description: string;
    }>;
    totalMissingCount: number;
    totalDamagedCount: number;
  };

  @Column({ default: false })
  isRejected: boolean;

  @Column('text', { nullable: true })
  rejectionReason: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
