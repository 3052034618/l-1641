import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  category: string;

  @Column({ length: 100, nullable: true })
  specification: string;

  @Column({ default: 0 })
  totalQuantity: number;

  @Column({ default: 0 })
  availableQuantity: number;

  @Column('text', { nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
