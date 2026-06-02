import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Office } from './office.entity';

/**
 * An authorized contact person for an office (BRD §5.2). An office may have
 * several; the request-create form lets the submitter choose which one applies.
 */
@Entity({ schema: 'users', name: 'office_contacts' })
@Index(['officeId'])
export class OfficeContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'office_id', type: 'uuid' })
  officeId!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ name: 'telephone_number', length: 50 })
  telephoneNumber!: string;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Office, (o) => o.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'office_id' })
  office?: Office;
}
