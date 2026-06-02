import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Office } from './office.entity';
import { UserPersona } from './user-persona.entity';

@Entity({ schema: 'users', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('citext', { unique: true })
  email!: string;

  @Column({ name: 'full_name_en', length: 200 })
  fullNameEn!: string;

  @Column({ name: 'full_name_ar', length: 200, nullable: true })
  fullNameAr?: string;

  @Column({ name: 'office_id', type: 'uuid', nullable: true })
  officeId?: string;

  @ManyToOne(() => Office, { nullable: true })
  @JoinColumn({ name: 'office_id' })
  office?: Office;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => UserPersona, (up) => up.user)
  userPersonas?: UserPersona[];
}
