/**
 * ═══════════════════════════════════════════════════════════════════
 * Visa Request State Machine — pure functions only.
 *
 * This file is the SOURCE OF TRUTH for BRD §5.2 workflow rules.
 * Any change here MUST update docs/03-workflow-state-machine.md
 * and add a corresponding test case in state-machine.spec.ts.
 *
 * No I/O, no DB access — keeps the workflow logic testable in isolation.
 * ═══════════════════════════════════════════════════════════════════
 */

export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'INITIAL_VERIFICATION'
  | 'FINAL_VERIFICATION'
  | 'DIRECTOR_REVIEW'
  | 'TYPIST_PROCESSING'
  | 'WAITING_FOR_EMBASSY'
  | 'AT_EMBASSY'
  | 'TYPIST_FEE_UPDATE'
  | 'WAITING_FINAL_REVIEW'
  | 'COMPLETED'
  | 'RETURNED_TO_OFFICE'
  | 'APOLOGIZED'
  | 'REJECTED';

export type PersonaCode = 'OFFICE' | 'SENIOR_ADMIN' | 'SENIOR_OFFICER' | 'DIRECTOR' | 'TYPIST' | 'EMBASSY' | 'SYSADMIN';

export type WorkflowAction =
  | 'SUBMIT'
  | 'START_INITIAL_VERIFY'
  | 'VERIFY_OK'
  | 'RETURN_TO_OFFICE'
  | 'APPROVE'
  | 'RETURN_FOR_CORRECTION'
  | 'APOLOGIZE'
  | 'REJECT'
  | 'SEND_TO_EMBASSY'
  | 'EMBASSY_PROCESS'
  | 'UPLOAD_VISAS'
  | 'SUBMIT_FEES'
  | 'REASSIGN_TO_SELF'
  | 'COMPLETE'
  | 'RESUBMIT';

export interface TransitionRule {
  from: RequestStatus;
  action: WorkflowAction;
  to: RequestStatus;
  allowedPersonas: PersonaCode[];
  commentRequired?: boolean;
  /** What documents must exist on the request before this transition is permitted */
  requiresDocuments?: DocumentRequirement[];
}

export interface DocumentRequirement {
  kind: 'OFFICE_LETTER' | 'BENEFICIARY_ATTACHMENT' | 'EMBASSY_VISA_FORM' | 'EMBASSY_LETTER' | 'VISA_APPLICATION' | 'VISA';
  /** 'one' = exactly one; 'one_per_beneficiary' = count must equal beneficiary count */
  count: 'one' | 'one_per_beneficiary';
}

export const TRANSITION_TABLE: TransitionRule[] = [
  {
    from: 'DRAFT', action: 'SUBMIT', to: 'SUBMITTED',
    allowedPersonas: ['OFFICE', 'SENIOR_ADMIN'],
    requiresDocuments: [
      { kind: 'OFFICE_LETTER', count: 'one' },
      { kind: 'BENEFICIARY_ATTACHMENT', count: 'one_per_beneficiary' },
      { kind: 'EMBASSY_VISA_FORM', count: 'one_per_beneficiary' },
    ],
  },
  { from: 'SUBMITTED', action: 'START_INITIAL_VERIFY', to: 'INITIAL_VERIFICATION', allowedPersonas: ['SENIOR_ADMIN'] },
  { from: 'INITIAL_VERIFICATION', action: 'VERIFY_OK', to: 'FINAL_VERIFICATION', allowedPersonas: ['SENIOR_ADMIN'] },
  { from: 'INITIAL_VERIFICATION', action: 'RETURN_TO_OFFICE', to: 'RETURNED_TO_OFFICE', allowedPersonas: ['SENIOR_ADMIN'], commentRequired: true },
  {
    from: 'FINAL_VERIFICATION', action: 'VERIFY_OK', to: 'DIRECTOR_REVIEW',
    allowedPersonas: ['SENIOR_OFFICER'],
    requiresDocuments: [{ kind: 'EMBASSY_LETTER', count: 'one' }],
  },
  { from: 'FINAL_VERIFICATION', action: 'RETURN_TO_OFFICE', to: 'RETURNED_TO_OFFICE', allowedPersonas: ['SENIOR_OFFICER'], commentRequired: true },
  { from: 'DIRECTOR_REVIEW', action: 'APPROVE', to: 'TYPIST_PROCESSING', allowedPersonas: ['DIRECTOR'] },
  { from: 'DIRECTOR_REVIEW', action: 'RETURN_FOR_CORRECTION', to: 'FINAL_VERIFICATION', allowedPersonas: ['DIRECTOR'], commentRequired: true },
  { from: 'DIRECTOR_REVIEW', action: 'APOLOGIZE', to: 'APOLOGIZED', allowedPersonas: ['DIRECTOR'], commentRequired: true },
  // Per docs/03-workflow-state-machine.md §5.2: the Director may outright reject.
  { from: 'DIRECTOR_REVIEW', action: 'REJECT', to: 'REJECTED', allowedPersonas: ['DIRECTOR'], commentRequired: true },
  {
    from: 'TYPIST_PROCESSING', action: 'SEND_TO_EMBASSY', to: 'WAITING_FOR_EMBASSY',
    allowedPersonas: ['TYPIST'],
    requiresDocuments: [{ kind: 'VISA_APPLICATION', count: 'one_per_beneficiary' }],
  },
  // Embassy processes the request and must attach the issued visa (one per
  // beneficiary) as part of processing.
  {
    from: 'WAITING_FOR_EMBASSY', action: 'EMBASSY_PROCESS', to: 'AT_EMBASSY',
    allowedPersonas: ['EMBASSY'],
    requiresDocuments: [{ kind: 'VISA', count: 'one_per_beneficiary' }],
  },
  { from: 'WAITING_FOR_EMBASSY', action: 'REASSIGN_TO_SELF', to: 'WAITING_FOR_EMBASSY', allowedPersonas: ['TYPIST'] },
  // After embassy processing, office (or typist on behalf) uploads issued visa
  // documents. The request then goes to the Typist for fee information update.
  {
    from: 'AT_EMBASSY', action: 'UPLOAD_VISAS', to: 'TYPIST_FEE_UPDATE',
    allowedPersonas: ['OFFICE', 'TYPIST'],
    requiresDocuments: [{ kind: 'VISA', count: 'one_per_beneficiary' }],
  },
  { from: 'AT_EMBASSY', action: 'REASSIGN_TO_SELF', to: 'AT_EMBASSY', allowedPersonas: ['TYPIST'] },
  // Typist updates the fees (via the fees endpoint) then forwards for final review.
  { from: 'TYPIST_FEE_UPDATE', action: 'SUBMIT_FEES', to: 'WAITING_FINAL_REVIEW', allowedPersonas: ['TYPIST'] },
  // Visio: Typist may bounce the request back so the office re-uploads corrected visas.
  { from: 'TYPIST_FEE_UPDATE', action: 'RETURN_FOR_CORRECTION', to: 'AT_EMBASSY', allowedPersonas: ['TYPIST'], commentRequired: true },
  { from: 'WAITING_FINAL_REVIEW', action: 'COMPLETE', to: 'COMPLETED', allowedPersonas: ['SENIOR_OFFICER'] },
  // Visio: at Final Review the Senior Officer may return for correction (back to the typist fee/info stage).
  { from: 'WAITING_FINAL_REVIEW', action: 'RETURN_FOR_CORRECTION', to: 'TYPIST_FEE_UPDATE', allowedPersonas: ['SENIOR_OFFICER'], commentRequired: true },
  { from: 'RETURNED_TO_OFFICE', action: 'RESUBMIT', to: 'SUBMITTED', allowedPersonas: ['OFFICE', 'SENIOR_ADMIN'] },
];

export interface TransitionContext {
  comment?: string;
  /** Document presence info supplied by document-service */
  documentCounts?: Partial<Record<DocumentRequirement['kind'], number>>;
  beneficiaryCount?: number;
}

export type TransitionError =
  | { code: 'ILLEGAL_TRANSITION'; message: string }
  | { code: 'PERSONA_NOT_AUTHORIZED'; message: string }
  | { code: 'COMMENT_REQUIRED'; message: string }
  | { code: 'MISSING_DOCUMENTS'; message: string; details?: unknown };

export interface TransitionResult {
  ok: boolean;
  newStatus?: RequestStatus;
  rule?: TransitionRule;
  error?: TransitionError;
}

/**
 * The single function that decides if a transition is permitted.
 *
 * @param current  current request status
 * @param action   the action being requested
 * @param personas the actor's personas
 * @param ctx      additional context (comments, document counts, etc.)
 */
export function executeTransition(
  current: RequestStatus,
  action: WorkflowAction,
  personas: PersonaCode[],
  ctx: TransitionContext = {},
): TransitionResult {
  const rule = TRANSITION_TABLE.find((r) => r.from === current && r.action === action);

  if (!rule) {
    return {
      ok: false,
      error: {
        code: 'ILLEGAL_TRANSITION',
        message: `Action '${action}' is not allowed from state '${current}'`,
      },
    };
  }

  const personaOk = rule.allowedPersonas.some((p) => personas.includes(p));
  if (!personaOk) {
    return {
      ok: false,
      error: {
        code: 'PERSONA_NOT_AUTHORIZED',
        message: `Requires one of: ${rule.allowedPersonas.join(', ')}; actor has: ${personas.join(', ')}`,
      },
    };
  }

  if (rule.commentRequired && !ctx.comment?.trim()) {
    return {
      ok: false,
      error: {
        code: 'COMMENT_REQUIRED',
        message: `Action '${action}' requires a non-empty comment`,
      },
    };
  }

  if (rule.requiresDocuments && rule.requiresDocuments.length > 0) {
    const docMissing: string[] = [];
    for (const req of rule.requiresDocuments) {
      const have = ctx.documentCounts?.[req.kind] ?? 0;
      const need = req.count === 'one' ? 1 : (ctx.beneficiaryCount ?? 0);
      if (have < need) {
        docMissing.push(`${req.kind}: need ${need}, have ${have}`);
      }
    }
    if (docMissing.length > 0) {
      return {
        ok: false,
        error: {
          code: 'MISSING_DOCUMENTS',
          message: 'Required documents are missing',
          details: docMissing,
        },
      };
    }
  }

  return { ok: true, newStatus: rule.to, rule };
}

/**
 * What actions are available to a user with the given personas from the current state?
 * Used by the frontend to render the right action buttons.
 */
export function availableActions(current: RequestStatus, personas: PersonaCode[]): WorkflowAction[] {
  return TRANSITION_TABLE
    .filter((r) => r.from === current && r.allowedPersonas.some((p) => personas.includes(p)))
    .map((r) => r.action);
}

/** Whether the request has reached a terminal state. */
export function isTerminal(status: RequestStatus): boolean {
  return status === 'COMPLETED' || status === 'APOLOGIZED' || status === 'REJECTED';
}
