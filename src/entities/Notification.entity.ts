import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { NotificationType, NotificationChannel, UserRole } from '../enums';
import { User } from './User.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.notifications, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    nullable: true,
  })
  targetRole: UserRole;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.SOCKET,
  })
  channel: NotificationChannel;

  @Column({ length: 200 })
  title: string;

  @Column('text')
  content: string;

  @Column('simple-json', { nullable: true })
  relatedData: {
    entityType: string;
    entityId: string;
    entityCode: string;
    additionalInfo: Record<string, any>;
  };

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ default: false })
  isSent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
