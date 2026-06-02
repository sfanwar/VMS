import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transition, AuditEvent } from '../entities/transition.entity';
import {
  executeTransition,
  TransitionContext,
  WorkflowAction,
  RequestStatus,
  PersonaCode,
  availableActions,
  TRANSITION_TABLE,
} from '../state-machine/state-machine';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

export interface ExecuteTransitionInput {
  requestId: string;
  action: WorkflowAction;
  comment?: string;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Transition) private readonly transitions: Repository<Transition>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
  ) {}

  async execute(
    input: ExecuteTransitionInput,
    actor: AuthenticatedUser,
    httpContext: { ipAddress?: string; userAgent?: string },
  ) {
    // 1. Fetch current request state from request-service
    const requestSnapshot = await this.fetchRequest(input.requestId);
    if (!requestSnapshot) {
      throw new NotFoundException({ errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    }

    // 2. Fetch document counts from document-service
    const documentCounts = await this.fetchDocumentCounts(input.requestId);

    // 3. Run pure state machine
    const ctx: TransitionContext = {
      comment: input.comment,
      documentCounts,
      beneficiaryCount: requestSnapshot.beneficiaryCount,
    };

    const personasTyped = actor.personas as PersonaCode[];
    const result = executeTransition(
      requestSnapshot.status,
      input.action,
      personasTyped,
      ctx,
    );

    if (!result.ok) {
      this.logger.warn(`Transition rejected: ${result.error?.code} — ${result.error?.message}`);
      if (result.error?.code === 'PERSONA_NOT_AUTHORIZED') {
        throw new ForbiddenException({ errorCode: result.error.code, message: result.error.message });
      }
      throw new BadRequestException({
        errorCode: result.error?.code ?? 'TRANSITION_FAILED',
        message: result.error?.message ?? 'Transition failed',
        details: (result.error as { details?: unknown })?.details,
      });
    }

    // 4. Persist transition row + audit event (single TX in production with @Transaction)
    const matchedPersona = result.rule!.allowedPersonas.find((p) => personasTyped.includes(p))!;
    const txn = await this.transitions.save(this.transitions.create({
      requestId: input.requestId,
      fromStatus: requestSnapshot.status,
      toStatus: result.newStatus!,
      actorUserId: actor.id,
      actorPersona: matchedPersona,
      action: input.action,
      comment: input.comment ?? undefined,
      metadata: { ipAddress: httpContext.ipAddress, userAgent: httpContext.userAgent },
    }));

    await this.audit.save(this.audit.create({
      eventType: 'WORKFLOW_TRANSITION',
      entityType: 'visa_request',
      entityId: input.requestId,
      actorUserId: actor.id,
      actorPersona: matchedPersona,
      payload: {
        action: input.action,
        from: requestSnapshot.status,
        to: result.newStatus,
        comment: input.comment,
      },
      ipAddress: httpContext.ipAddress ?? undefined,
      userAgent: httpContext.userAgent ?? undefined,
    }));

    // 5. Tell request-service to update its status
    await this.updateRequestStatus(input.requestId, result.newStatus!);

    // 6. Fire-and-forget: queue notifications (best-effort)
    this.queueNotifications(
      input.requestId,
      requestSnapshot.requestNumber,
      input.action,
      result.newStatus!,
      requestSnapshot.beneficiaryCount,
    ).catch((err) => {
      this.logger.error('Failed to queue notifications', err);
    });

    return {
      requestId: input.requestId,
      fromStatus: requestSnapshot.status,
      toStatus: result.newStatus,
      action: input.action,
      transitionId: txn.id,
      occurredAt: txn.occurredAt,
    };
  }

  async getHistory(requestId: string): Promise<Transition[]> {
    return this.transitions.find({
      where: { requestId },
      order: { occurredAt: 'ASC' },
    });
  }

  getStateMachine() {
    return {
      states: Array.from(new Set(TRANSITION_TABLE.flatMap((t) => [t.from, t.to]))),
      transitions: TRANSITION_TABLE,
    };
  }

  getNextActions(currentStatus: RequestStatus, personas: PersonaCode[]) {
    return availableActions(currentStatus, personas);
  }

  // ───────────── Inter-service calls (HTTP) ─────────────

  private async fetchRequest(requestId: string): Promise<{ status: RequestStatus; beneficiaryCount: number; requestNumber: string } | null> {
    const url = process.env.REQUEST_SERVICE_URL ?? 'http://request-service:3003';
    try {
      const res = await fetch(`${url}/api/internal/requests/${requestId}/snapshot`, {
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key' },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      this.logger.error('Failed to fetch request snapshot', err as Error);
      throw new Error('Could not fetch request state');
    }
  }

  private async updateRequestStatus(requestId: string, newStatus: RequestStatus): Promise<void> {
    const url = process.env.REQUEST_SERVICE_URL ?? 'http://request-service:3003';
    const res = await fetch(`${url}/api/internal/requests/${requestId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key',
      },
      body: JSON.stringify({ newStatus }),
    });
    if (!res.ok) {
      throw new Error(`Failed to update request status: HTTP ${res.status}`);
    }
  }

  private async fetchDocumentCounts(requestId: string): Promise<Record<string, number>> {
    const url = process.env.DOCUMENT_SERVICE_URL ?? 'http://document-service:3005';
    try {
      const res = await fetch(`${url}/api/internal/documents/counts?requestId=${requestId}`, {
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key' },
      });
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  private async queueNotifications(
    requestId: string,
    requestNumber: string,
    action: WorkflowAction,
    newStatus: RequestStatus,
    beneficiaryCount: number,
  ): Promise<void> {
    const url = process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:3006';
    await fetch(`${url}/api/internal/notifications/workflow-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key',
      },
      body: JSON.stringify({ requestId, requestNumber, action, newStatus, beneficiaryCount }),
    }).catch(() => {
      // Notifications are best-effort
    });
  }
}
