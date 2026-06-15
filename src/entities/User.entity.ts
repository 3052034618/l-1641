import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { UserRole } from '../enums';
import { Department } from './Department.entity';
import { WorkOrder } from './WorkOrder.entity';
import { Notification } from './Notification.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ length: 100 })
  password: string;

  @Column({ length: 50 })
  realName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @ManyToOne(() => Department, department => department.users, { nullable: true })
  @JoinColumn({ name: 'departmentId' })
  department: Department;

  @Column({ nullable: true })
  departmentId: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => WorkOrder, workOrder => workOrder.assignedEngineer)
  assignedWorkOrders: WorkOrder[];

  @OneToMany(() => Notification, notification => notification.user)
  notifications: Notification[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
