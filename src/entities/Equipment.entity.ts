import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SterilizerType, EquipmentStatus } from '../enums';
import { SterilizationBatch } from './SterilizationBatch.entity';
import { WorkOrder } from './WorkOrder.entity';

@Entity('equipment')
export class Equipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: SterilizerType,
    nullable: true,
  })
  type: SterilizerType;

  @Column({ length: 50, nullable: true })
  model: string;

  @Column({ length: 50, nullable: true })
  manufacturer: string;

  @Column({ type: 'timestamp', nullable: true })
  installDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastMaintenanceDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextMaintenanceDate: Date;

  @Column({
    type: 'enum',
    enum: EquipmentStatus,
    default: EquipmentStatus.OPERATIONAL,
  })
  status: EquipmentStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 121 })
  maxTemperature: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 210 })
  maxPressure: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 115 })
  minTemperature: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 180 })
  minPressure: number;

  @Column({ default: 30 })
  sterilizationDuration: number;

  @OneToMany(() => SterilizationBatch, batch => batch.equipment)
  sterilizationBatches: SterilizationBatch[];

  @OneToMany(() => WorkOrder, workOrder => workOrder.equipment)
  workOrders: WorkOrder[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
