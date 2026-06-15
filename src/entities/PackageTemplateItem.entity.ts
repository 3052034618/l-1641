import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PackageTemplate } from './PackageTemplate.entity';
import { Instrument } from './Instrument.entity';

@Entity('package_template_items')
export class PackageTemplateItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PackageTemplate, template => template.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  packageTemplate: PackageTemplate;

  @Column()
  templateId: string;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrumentId' })
  instrument: Instrument;

  @Column()
  instrumentId: string;

  @Column({ default: 1 })
  requiredQuantity: number;
}
