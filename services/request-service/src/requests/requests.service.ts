import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VisaRequest } from '../entities/visa-request.entity';
import { Beneficiary } from '../entities/beneficiary.entity';
import { CreateRequestDto, UpdateRequestDto, UpdateFeesDto, UpdateBeneficiaryVisaDto, ListRequestsQueryDto } from '../dto/request.dto';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

/**
 * Statuses in which an EMBASSY user is permitted to see a request.
 * Outside of these, EMBASSY users receive 404 (not 403) to avoid
 * leaking the existence of FAD-internal cases.
 */
const EMBASSY_VISIBLE_STATUSES = ['WAITING_FOR_EMBASSY', 'AT_EMBASSY'] as const;

/**
 * Stages at which the Typist may capture embassy-issued visa data. Visas are
 * uploaded at AT_EMBASSY and the request is then worked in TYPIST_FEE_UPDATE
 * before final review; outside these stages the visa fields are locked.
 * Mirrors VISA_INFO_EDITABLE_STATUSES in the frontend RequestDetailPage.
 */
const VISA_INFO_EDITABLE_STATUSES = ['AT_EMBASSY', 'TYPIST_FEE_UPDATE'] as const;

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(VisaRequest) private readonly requests: Repository<VisaRequest>,
    @InjectRepository(Beneficiary) private readonly beneficiaries: Repository<Beneficiary>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async create(dto: CreateRequestDto, actor: AuthenticatedUser): Promise<VisaRequest> {
    if (dto.beneficiaries.length !== dto.numberOfPassengers) {
      throw new ConflictException({
        errorCode: 'BENEFICIARY_COUNT_MISMATCH',
        message: 'Number of beneficiaries must equal numberOfPassengers',
      });
    }

    // RBAC: Office users can only create for their own office
    const officeId = this.resolveOfficeId(dto.officeId, actor);

    // Get a new request number via DB function (atomic)
    const result = await this.ds.query<{ next_request_number: string }[]>(
      `SELECT requests.next_request_number() AS next_request_number`,
    );
    const requestNumber = result[0].next_request_number;

    const request = this.requests.create({
      requestNumber,
      officeId,
      officeContactId: dto.officeContactId ?? undefined,
      createdByUserId: actor.id,
      countryOfVisitId: dto.countryOfVisitId,
      visaTypeId: dto.visaTypeId,
      numberOfPassengers: dto.numberOfPassengers,
      requestDate: new Date().toISOString().slice(0, 10),
      status: 'DRAFT',
    });

    const saved = await this.requests.save(request);

    // Save beneficiaries
    const beneficiaryEntities = dto.beneficiaries.map((b, i) =>
      this.beneficiaries.create({
        requestId: saved.id,
        fullNameEn: b.fullNameEn,
        fullNameAr: b.fullNameAr ?? undefined,
        passportNumber: b.passportNumber ?? undefined,
        nationality: b.nationality ?? undefined,
        sequenceNo: i + 1,
      }),
    );
    await this.beneficiaries.save(beneficiaryEntities);

    return this.findByIdForActor(saved.id, actor);
  }

  /**
   * Returns the request if the actor is permitted to see it; otherwise 404 (not 403)
   * to avoid leaking existence.
   */
  async findByIdForActor(id: string, actor: AuthenticatedUser): Promise<VisaRequest> {
    const request = await this.requests.findOne({ where: { id }, relations: ['beneficiaries'] });
    if (!request) throw new NotFoundException({ errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' });

    if (!this.canActorSeeRequest(request, actor)) {
      throw new NotFoundException({ errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    }
    return request;
  }

  async list(query: ListRequestsQueryDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.requests.createQueryBuilder('r')
      .leftJoinAndSelect('r.beneficiaries', 'b')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.officeId) qb.andWhere('r.officeId = :officeId', { officeId: query.officeId });

    // RBAC: OFFICE persona sees requests for their own office OR ones they
    // created (they may submit on behalf of other offices).
    if (actor.personas.includes('OFFICE') && !this.isFadStaff(actor)) {
      if (!actor.officeId) {
        qb.andWhere('r.createdByUserId = :actorId', { actorId: actor.id });
      } else {
        qb.andWhere('(r.officeId = :userOfficeId OR r.createdByUserId = :actorId)', {
          userOfficeId: actor.officeId,
          actorId: actor.id,
        });
      }
    }

    // RBAC: EMBASSY persona (without FAD-staff overlap) only sees the embassy queue.
    // The Embassy is an external actor; their queue is the set of requests
    // currently awaiting or being processed at the embassy.
    if (actor.personas.includes('EMBASSY') && !this.isFadStaff(actor)) {
      qb.andWhere('r.status IN (:...embassyStatuses)', { embassyStatuses: EMBASSY_VISIBLE_STATUSES });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async update(id: string, dto: UpdateRequestDto, actor: AuthenticatedUser): Promise<VisaRequest> {
    const request = await this.findByIdForActor(id, actor);
    if (request.status !== 'DRAFT' && request.status !== 'RETURNED_TO_OFFICE') {
      throw new ConflictException({
        errorCode: 'REQUEST_LOCKED',
        message: `Cannot edit a request in ${request.status} state`,
      });
    }
    Object.assign(request, dto);
    return this.requests.save(request);
  }

  async updateFees(id: string, dto: UpdateFeesDto, actor: AuthenticatedUser): Promise<VisaRequest> {
    if (!actor.personas.includes('TYPIST')) {
      throw new ForbiddenException({ errorCode: 'INSUFFICIENT_PERMISSIONS', message: 'Only the Typist can update fees' });
    }
    const request = await this.findByIdForActor(id, actor);
    request.feesAmount = dto.feesAmount;
    request.feesCurrency = dto.feesCurrency ?? 'AED';
    request.feesUpdatedAt = new Date();
    request.feesUpdatedBy = actor.id;
    return this.requests.save(request);
  }

  /**
   * Typist fills in embassy-issued visa data (visa number, issue date,
   * appointment) for a single beneficiary. Persona-gated to TYPIST and scoped
   * to a request the actor may see; only the provided fields are written so the
   * data can be saved incrementally.
   */
  async updateBeneficiaryVisa(
    requestId: string,
    beneficiaryId: string,
    dto: UpdateBeneficiaryVisaDto,
    actor: AuthenticatedUser,
  ): Promise<VisaRequest> {
    if (!actor.personas.includes('TYPIST')) {
      throw new ForbiddenException({ errorCode: 'INSUFFICIENT_PERMISSIONS', message: 'Only the Typist can update visa information' });
    }
    // Enforce visibility first (404, not 403, if the actor may not see it).
    const request = await this.findByIdForActor(requestId, actor);

    // Visa data is only editable at the embassy / fee-update stages.
    if (!VISA_INFO_EDITABLE_STATUSES.includes(request.status as any)) {
      throw new ConflictException({
        errorCode: 'VISA_INFO_LOCKED',
        message: `Visa information cannot be edited in ${request.status} state`,
      });
    }

    const beneficiary = await this.beneficiaries.findOne({ where: { id: beneficiaryId, requestId } });
    if (!beneficiary) {
      throw new NotFoundException({ errorCode: 'BENEFICIARY_NOT_FOUND', message: 'Beneficiary not found on this request' });
    }

    if (dto.visaNumber !== undefined) beneficiary.visaNumber = dto.visaNumber;
    if (dto.visaIssuedAt !== undefined) beneficiary.visaIssuedAt = dto.visaIssuedAt;
    if (dto.appointmentAt !== undefined) beneficiary.appointmentAt = new Date(dto.appointmentAt);
    await this.beneficiaries.save(beneficiary);

    return this.findByIdForActor(requestId, actor);
  }

  async setStatus(id: string, newStatus: VisaRequest['status'], assigneeId?: string | null): Promise<VisaRequest> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException();
    request.status = newStatus;
    if (assigneeId !== undefined) request.currentAssigneeId = assigneeId ?? undefined;
    if (newStatus === 'SUBMITTED' && !request.submittedAt) request.submittedAt = new Date();
    if (newStatus === 'COMPLETED' || newStatus === 'APOLOGIZED' || newStatus === 'REJECTED') {
      request.completedAt = new Date();
    }
    return this.requests.save(request);
  }

  private canActorSeeRequest(request: VisaRequest, actor: AuthenticatedUser): boolean {
    if (this.isFadStaff(actor)) return true;
    // Office users: their own office's requests, or any they created themselves.
    if (actor.personas.includes('OFFICE')) {
      if (actor.officeId && actor.officeId === request.officeId) return true;
      if (request.createdByUserId === actor.id) return true;
    }
    // EMBASSY actors can see requests only while they're at the embassy stage.
    // Closed / pre-embassy / post-embassy requests are not visible to them.
    if (actor.personas.includes('EMBASSY') && EMBASSY_VISIBLE_STATUSES.includes(request.status as any)) return true;
    return false;
  }

  private isFadStaff(actor: AuthenticatedUser): boolean {
    return actor.personas.some((p) => ['SENIOR_ADMIN', 'SENIOR_OFFICER', 'DIRECTOR', 'TYPIST'].includes(p));
  }

  private resolveOfficeId(requestedOfficeId: string | undefined, actor: AuthenticatedUser): string {
    // Office users are locked to their own office: any submitted officeId is
    // ignored, and the request is linked to them via createdByUserId.
    if (actor.personas.includes('OFFICE') && !this.isFadStaff(actor)) {
      if (!actor.officeId) {
        throw new ForbiddenException({ errorCode: 'NO_OFFICE_ASSIGNED', message: 'No office is assigned to your account' });
      }
      return actor.officeId;
    }
    // FAD staff must specify an officeId
    if (!requestedOfficeId) {
      throw new ForbiddenException({ errorCode: 'OFFICE_ID_REQUIRED', message: 'FAD staff must provide officeId' });
    }
    return requestedOfficeId;
  }
}
