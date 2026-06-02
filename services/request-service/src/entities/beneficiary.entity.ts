import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { VisaRequest } from './visa-request.entity';

@Entity({ schema: 'requests', name: 'beneficiaries' })
export class Beneficiary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @ManyToOne(() => VisaRequest, (r) => r.beneficiaries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: VisaRequest;

  @Column({ name: 'full_name_en', length: 200 })
  fullNameEn!: string;

  @Column({ name: 'full_name_ar', length: 200, nullable: true })
  fullNameAr?: string;

  @Column({ name: 'passport_number', length: 50, nullable: true })
  passportNumber?: string;

  @Column({ length: 100, nullable: true })
  nationality?: string;

  @Column({ name: 'sequence_no', type: 'int' })
  sequenceNo!: number;

  @Column({ name: 'appointment_at', type: 'timestamptz', nullable: true })
  appointmentAt?: Date;

  @Column({ name: 'visa_number', length: 50, nullable: true })
  visaNumber?: string;

  @Column({ name: 'visa_issued_at', type: 'date', nullable: true })
  visaIssuedAt?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
