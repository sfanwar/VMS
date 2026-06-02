import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { Beneficiary } from './beneficiary.entity';

export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'INITIAL_VERIFICATION'
  | 'FINAL_VERIFICATION'
  | 'DIRECTOR_REVIEW'
  | 'TYPIST_PROCESSING'
  | 'WAITING_FOR_EMBASSY'
  | 'WAITING_FINAL_REVIEW'
  | 'COMPLETED'
  | 'RETURNED_TO_OFFICE'
  | 'APOLOGIZED'
  | 'REJECTED';

@Entity({ schema: 'requests', name: 'visa_requests' })
@Index(['status'])
@Index(['officeId'])
@Index(['currentAssigneeId'])
export class VisaRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_number', length: 30, unique: true })
  requestNumber!: string;

  @Column({ name: 'office_id', type: 'uuid' })
  officeId!: string;

  @Column({ name: 'office_contact_id', type: 'uuid', nullable: true })
  officeContactId?: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'country_of_visit_id', type: 'uuid' })
  countryOfVisitId!: string;

  @Column({ name: 'visa_type_id', type: 'uuid' })
  visaTypeId!: string;

  @Column({ name: 'number_of_passengers', type: 'int' })
  numberOfPassengers!: number;

  @Column({ name: 'request_date', type: 'date' })
  requestDate!: string;

  @Column({ type: 'enum', enum: ['DRAFT','SUBMITTED','INITIAL_VERIFICATION','FINAL_VERIFICATION','DIRECTOR_REVIEW','TYPIST_PROCESSING','WAITING_FOR_EMBASSY','WAITING_FINAL_REVIEW','COMPLETED','RETURNED_TO_OFFICE','APOLOGIZED','REJECTED'], enumName: 'request_status', default: 'DRAFT' })
  status!: RequestStatus;

  @Column({ name: 'current_assignee_id', type: 'uuid', nullable: true })
  currentAssigneeId?: string;

  @Column({ name: 'fees_amount', type: 'numeric', precision: 12, scale: 2, nullable: true })
  feesAmount?: string;

  @Column({ name: 'fees_currency', type: 'char', length: 3, default: 'AED' })
  feesCurrency!: string;

  @Column({ name: 'fees_updated_at', type: 'timestamptz', nullable: true })
  feesUpdatedAt?: Date;

  @Column({ name: 'fees_updated_by', type: 'uuid', nullable: true })
  feesUpdatedBy?: string;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Beneficiary, (b) => b.request, { cascade: true })
  beneficiaries?: Beneficiary[];
}
