import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { OfficeContact } from './office-contact.entity';

@Entity({ schema: 'users', name: 'offices' })
export class Office {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name_en', length: 200 })
  nameEn!: string;

  @Column({ name: 'name_ar', length: 200 })
  nameAr!: string;

  @Column({ name: 'authorized_person', length: 200 })
  authorizedPerson!: string;

  @Column({ name: 'telephone_number', length: 50 })
  telephoneNumber!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => OfficeContact, (c) => c.office)
  contacts?: OfficeContact[];
}
