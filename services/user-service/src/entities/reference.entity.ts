import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'users', name: 'countries' })
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'iso_code', length: 2, unique: true })
  isoCode!: string;

  @Column({ name: 'name_en', length: 100 })
  nameEn!: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ schema: 'users', name: 'visa_types' })
export class VisaType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 30, unique: true })
  code!: string;

  @Column({ name: 'name_en', length: 100 })
  nameEn!: string;

  @Column({ name: 'name_ar', length: 100 })
  nameAr!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
