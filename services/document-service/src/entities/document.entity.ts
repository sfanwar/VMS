import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type DocumentKind =
  | 'OFFICE_LETTER'
  | 'BENEFICIARY_ATTACHMENT'
  | 'EMBASSY_VISA_FORM'
  | 'SUPPORTING_DOCUMENT'
  | 'EMBASSY_LETTER'
  | 'VISA_APPLICATION'
  | 'VISA';

@Entity({ schema: 'documents', name: 'documents' })
@Index(['requestId', 'kind'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ name: 'beneficiary_id', type: 'uuid', nullable: true })
  beneficiaryId?: string;

  @Column({ type: 'enum', enum: ['OFFICE_LETTER','BENEFICIARY_ATTACHMENT','EMBASSY_VISA_FORM','SUPPORTING_DOCUMENT','EMBASSY_LETTER','VISA_APPLICATION','VISA'], enumName: 'document_kind' })
  kind!: DocumentKind;

  @Column({ name: 'original_name', length: 500 })
  originalName!: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ length: 64 })
  sha256!: string;

  @Column({ name: 'storage_key', length: 500 })
  storageKey!: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}
