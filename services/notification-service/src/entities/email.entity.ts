import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'BOUNCED';

@Entity({ schema: 'notifications', name: 'emails' })
@Index(['requestId'])
@Index(['status', 'queuedAt'])
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId?: string;

  @Column({ name: 'sent_by', type: 'uuid' })
  sentBy!: string;

  @Column({ name: 'to_addresses', type: 'text', array: true })
  toAddresses!: string[];

  @Column({ name: 'cc_addresses', type: 'text', array: true, nullable: true })
  ccAddresses?: string[];

  @Column({ name: 'bcc_addresses', type: 'text', array: true, nullable: true })
  bccAddresses?: string[];

  @Column({ length: 500 })
  subject!: string;

  @Column({ name: 'body_html', type: 'text', nullable: true })
  bodyHtml?: string;

  @Column({ name: 'body_text', type: 'text', nullable: true })
  bodyText?: string;

  @Column({ name: 'template_code', length: 50, nullable: true })
  templateCode?: string;

  @Column({ type: 'enum', enum: ['PENDING', 'SENT', 'FAILED', 'BOUNCED'], enumName: 'delivery_status', default: 'PENDING' })
  status!: DeliveryStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'queued_at', type: 'timestamptz' })
  queuedAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}

@Entity({ schema: 'notifications', name: 'in_app' })
@Index(['userId', 'isRead', 'createdAt'])
export class InAppNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId?: string;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
