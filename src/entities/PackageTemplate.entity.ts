import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PackageTemplateItem } from './PackageTemplateItem.entity';

@Entity('package_templates')
export class PackageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ default: 7 })
  validDays: number;

  @Column('text', { nullable: true })
  description: string;

  @OneToMany(() => PackageTemplateItem, item => item.packageTemplate, { cascade: true })
  items: PackageTemplateItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
