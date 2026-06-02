import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'auth', name: 'login_audit' })
export class LoginAudit {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('citext')
  email!: string;

  @Column('uuid', { name: 'user_id', nullable: true })
  userId?: string;

  @Column()
  success!: boolean;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
