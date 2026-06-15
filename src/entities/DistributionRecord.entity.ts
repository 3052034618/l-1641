import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InstrumentPackage } from './InstrumentPackage.entity';
import { User } from './User.entity';
import { Department } from './Department.entity';

@Entity('distribution_records')
export class DistributionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InstrumentPackage, pkg => pkg.distributionRecords)
  @JoinColumn({ name: 'packageId' })
  instrumentPackage: InstrumentPackage;

  @Column()
  packageId: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'toDepartmentId' })
  toDepartment: Department;

  @Column()
  toDepartmentId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'distributorId' })
  distributor: User;

  @Column()
  distributorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'receiverId' })
  receiver: User;

  @Column()
  receiverId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  distributedAt: Date;

  @Column({ default: false })
  isValidCheckPerformed: boolean;

  @Column({ default: false })
  isExpired: boolean;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date;

  @Column({ default: false })
  isReceived: boolean;

  @Column('simple-json', { nullable: true })
  validationResult: {
    packageStatus: string;
    validUntil: Date;
    isValid: boolean;
    daysRemaining: number;
    isExpired: boolean;
    isLocked: boolean;
    lockReason: string;
  };

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
