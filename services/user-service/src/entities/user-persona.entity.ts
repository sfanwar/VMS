import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ schema: 'users', name: 'personas' })
export class Persona {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 50, unique: true })
  code!: string;

  @Column({ name: 'name_en', length: 100 })
  nameEn!: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;
}

@Entity({ schema: 'users', name: 'user_personas' })
export class UserPersona {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @PrimaryColumn('uuid', { name: 'persona_id' })
  personaId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Persona, { eager: true })
  @JoinColumn({ name: 'persona_id' })
  persona!: Persona;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' })
  assignedAt!: Date;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy?: string;
}
