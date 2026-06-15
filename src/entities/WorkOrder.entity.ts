import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { WorkOrderStatus, WorkOrderPriority, SterilizerType } from '../enums';
import { Equipment } from './Equipment.entity';
import { User } from './User.entity';
import { CleaningTask } from './CleaningTask.entity';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  orderCode: string;

  @Column({
    type: 'enum',
    enum: SterilizerType,
    nullable: true,
  })
  equipmentType: SterilizerType;

  @ManyToOne(() => Equipment, equipment => equipment.workOrders)
  @JoinColumn({ name: 'equipmentId' })
  equipment: Equipment;

  @Column()
  equipmentId: string;

  @ManyToOne(() => User, engineer => engineer.assignedWorkOrders, { nullable: true })
  @JoinColumn({ name: 'assignedEngineerId' })
  assignedEngineer: User;

  @Column({ nullable: true })
  assignedEngineerId: string;

  @Column({
    type: 'enum',
    enum: WorkOrderStatus,
    default: WorkOrderStatus.OPEN,
  })
  status: WorkOrderStatus;

  @Column({
    type: 'enum',
    enum: WorkOrderPriority,
    default: WorkOrderPriority.MEDIUM,
  })
  priority: WorkOrderPriority;

  @Column({ length: 200 })
  title: string;

  @Column('text')
  description: string;

  @Column('simple-json', { nullable: true })
  anomalyDetails: {
    source: 'cleaning' | 'sterilization' | 'preventive';
    parameterName: string;
    expectedValue: string;
    actualValue: number;
    severity: string;
  };

  @OneToOne(() => CleaningTask, task => task.workOrder, { nullable: true })
  cleaningTask: CleaningTask;

  @Column({ nullable: true })
  cleaningTaskId: string;

  @Column({ type: 'timestamp', nullable: true })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  @Column('text', { nullable: true })
  repairNotes: string;

  @Column('text', { nullable: true })
  resolution: string;

  @Column({ default: 0 })
  estimatedCost: number;

  @Column({ default: 0 })
  actualCost: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
