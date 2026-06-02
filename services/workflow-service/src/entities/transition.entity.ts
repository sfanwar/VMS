import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'workflow', name: 'transitions' })
@Index(['requestId', 'occurredAt'])
export class Transition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ name: 'from_status', length: 40, nullable: true })
  fromStatus?: string;

  @Column({ name: 'to_status', length: 40 })
  toStatus!: string;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @Column({ name: 'actor_persona', length: 50 })
  actorPersona!: string;

  @Column({ length: 50 })
  action!: string;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: unknown;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}

@Entity({ schema: 'workflow', name: 'audit_events' })
@Index(['entityType', 'entityId', 'occurredAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'event_type', length: 50 })
  eventType!: string;

  @Column({ name: 'entity_type', length: 50 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string;

  @Column({ name: 'actor_persona', length: 50, nullable: true })
  actorPersona?: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
