import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { CleaningProgram, ContaminationLevel } from '../enums';
import { InstrumentPackage } from './InstrumentPackage.entity';
import { User } from './User.entity';
import { WorkOrder } from './WorkOrder.entity';

@Entity('cleaning_tasks')
export class CleaningTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InstrumentPackage, pkg => pkg.cleaningTasks)
  @JoinColumn({ name: 'packageId' })
  instrumentPackage: InstrumentPackage;

  @Column()
  packageId: string;

  @Column({
    type: 'enum',
    enum: ContaminationLevel,
  })
  contaminationLevel: ContaminationLevel;

  @Column({
    type: 'enum',
    enum: CleaningProgram,
  })
  assignedProgram: CleaningProgram;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'operatorId' })
  operator: User;

  @Column()
  operatorId: string;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ default: false })
  isSuccessful: boolean;

  @Column('simple-json', { nullable: true })
  runParameters: {
    waterTemperature: number;
    detergentConcentration: number;
    cleaningDuration: number;
    rinseCount: number;
    dryingTemperature: number;
    dryingDuration: number;
    phValue: number;
    conductivity: number;
  };

  @Column('simple-json', { nullable: true })
  parameterAnomalies: Array<{
    parameter: string;
    expectedRange: string;
    actualValue: number;
    severity: 'warning' | 'error';
    description: string;
  }>;

  @Column({ default: false })
  hasAnomalies: boolean;

  @OneToOne(() => WorkOrder, workOrder => workOrder.cleaningTask, { nullable: true })
  workOrder: WorkOrder;

  @Column({ nullable: true })
  workOrderId: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
