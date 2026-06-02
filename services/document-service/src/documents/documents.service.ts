import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Document, DocumentKind } from '../entities/document.entity';
import { StorageService } from './storage.service';

// Max 25 MB per file, per BRD-aligned limits
const MAX_BYTES = 25 * 1024 * 1024;

const MIME_BY_KIND: Record<DocumentKind, string[]> = {
  OFFICE_LETTER: ['application/pdf'],
  BENEFICIARY_ATTACHMENT: ['application/pdf', 'image/jpeg', 'image/png'],
  EMBASSY_VISA_FORM: ['application/pdf'],
  SUPPORTING_DOCUMENT: ['application/pdf', 'image/jpeg', 'image/png'],
  EMBASSY_LETTER: ['application/pdf'],
  VISA_APPLICATION: ['application/pdf'],
  VISA: ['application/pdf', 'image/jpeg', 'image/png'],
};

export interface UploadInput {
  requestId: string;
  beneficiaryId?: string;
  kind: DocumentKind;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  uploadedBy: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly docs: Repository<Document>,
    private readonly storage: StorageService,
  ) {}

  async upload(input: UploadInput): Promise<Document> {
    if (input.buffer.length > MAX_BYTES) {
      throw new PayloadTooLargeException({
        errorCode: 'FILE_TOO_LARGE',
        message: `File exceeds maximum size of ${MAX_BYTES} bytes`,
      });
    }

    const allowed = MIME_BY_KIND[input.kind];
    if (!allowed.includes(input.mimeType)) {
      throw new BadRequestException({
        errorCode: 'INVALID_MIME_TYPE',
        message: `${input.kind} must be one of: ${allowed.join(', ')}`,
      });
    }

    const docId = crypto.randomUUID();
    const storageKey = this.storage.buildKey(input.requestId, docId, input.originalName);
    const { sha256, sizeBytes } = await this.storage.upload(storageKey, input.buffer, input.mimeType);

    const doc = this.docs.create({
      id: docId,
      requestId: input.requestId,
      beneficiaryId: input.beneficiaryId ?? undefined,
      kind: input.kind,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: String(sizeBytes),
      sha256,
      storageKey,
      uploadedBy: input.uploadedBy,
    });
    return this.docs.save(doc);
  }

  async findOne(id: string): Promise<Document> {
    const doc = await this.docs.findOne({ where: { id, deletedAt: IsNull() } });
    if (!doc) throw new NotFoundException({ errorCode: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    return doc;
  }

  async listByRequest(requestId: string): Promise<Document[]> {
    return this.docs.find({ where: { requestId, deletedAt: IsNull() }, order: { uploadedAt: 'ASC' } });
  }

  async softDelete(id: string): Promise<void> {
    const doc = await this.findOne(id);
    doc.deletedAt = new Date();
    await this.docs.save(doc);
  }

  /** Returns counts by kind for a request — used by workflow-service to validate transitions. */
  async countsByKind(requestId: string): Promise<Record<string, number>> {
    const rows = await this.docs
      .createQueryBuilder('d')
      .select('d.kind', 'kind')
      .addSelect('COUNT(*)', 'count')
      .where('d.request_id = :requestId AND d.deleted_at IS NULL', { requestId })
      .groupBy('d.kind')
      .getRawMany<{ kind: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.kind, Number(r.count)]));
  }

  async getDownloadStream(id: string) {
    const doc = await this.findOne(id);
    const stream = await this.storage.download(doc.storageKey);
    return { stream, doc };
  }
}
