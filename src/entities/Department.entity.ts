import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { DepartmentZone } from '../enums';
import { User } from './User.entity';
import { InstrumentPackage } from './InstrumentPackage.entity';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: DepartmentZone,
    default: DepartmentZone.INPATIENT,
  })
  zone: DepartmentZone;

  @Column({ length: 50, nullable: true })
  contactPerson: string;

  @Column({ length: 20, nullable: true })
  contactPhone: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('text', { nullable: true })
  description: string;

  @OneToMany(() => User, user => user.department)
  users: User[];

  @OneToMany(() => InstrumentPackage, pkg => pkg.department)
  packages: InstrumentPackage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
