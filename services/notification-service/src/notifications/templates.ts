/**
 * Email templates keyed by workflow action.
 * Each template returns subject, plain text body, and optional HTML body.
 * Variables are interpolated from the event context.
 */

export interface TemplateContext {
  requestNumber?: string;
  actorName?: string;
  comment?: string;
  newStatus?: string;
  beneficiaryCount?: number;
  feesAmount?: string;
  feesCurrency?: string;
}

export interface RenderedTemplate {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export type TemplateRenderer = (ctx: TemplateContext) => RenderedTemplate;

// Helper for basic HTML escaping
const esc = (s: string | undefined): string =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

export const TEMPLATES: Record<string, TemplateRenderer> = {
  SUBMIT: (ctx) => ({
    subject: `[VMS] New visa request submitted: ${ctx.requestNumber}`,
    bodyText:
      `A new visa request has been submitted.\n\nRequest: ${ctx.requestNumber}\nBeneficiaries: ${ctx.beneficiaryCount ?? '—'}\n\nPlease begin initial verification.`,
    bodyHtml:
      `<p>A new visa request has been submitted.</p><p><strong>Request:</strong> ${esc(ctx.requestNumber)}<br><strong>Beneficiaries:</strong> ${ctx.beneficiaryCount ?? '—'}</p><p>Please begin initial verification.</p>`,
  }),

  RETURN_TO_OFFICE: (ctx) => ({
    subject: `[VMS] Request returned: ${ctx.requestNumber}`,
    bodyText:
      `Your visa request ${ctx.requestNumber} has been returned for correction.\n\nReviewer comment:\n${ctx.comment ?? '(no comment provided)'}\n\nPlease address the comments and resubmit.`,
    bodyHtml:
      `<p>Your visa request <strong>${esc(ctx.requestNumber)}</strong> has been returned for correction.</p><blockquote>${esc(ctx.comment ?? '(no comment provided)')}</blockquote><p>Please address the comments and resubmit.</p>`,
  }),

  APPROVE: (ctx) => ({
    subject: `[VMS] Request approved: ${ctx.requestNumber}`,
    bodyText:
      `Visa request ${ctx.requestNumber} has been approved by the Director and is now with the Typist for embassy processing.`,
    bodyHtml:
      `<p>Visa request <strong>${esc(ctx.requestNumber)}</strong> has been approved by the Director and is now with the Typist for embassy processing.</p>`,
  }),

  APOLOGIZE: (ctx) => ({
    subject: `[VMS] Apology — request ${ctx.requestNumber}`,
    bodyText:
      `We regret to inform you that visa request ${ctx.requestNumber} cannot be processed.\n\n${ctx.comment ?? ''}\n\nWe apologize for any inconvenience.`,
    bodyHtml:
      `<p>We regret to inform you that visa request <strong>${esc(ctx.requestNumber)}</strong> cannot be processed.</p><blockquote>${esc(ctx.comment ?? '')}</blockquote><p>We apologize for any inconvenience.</p>`,
  }),

  REJECT: (ctx) => ({
    subject: `[VMS] Request rejected: ${ctx.requestNumber}`,
    bodyText:
      `Visa request ${ctx.requestNumber} has been rejected.\n\nReason:\n${ctx.comment ?? '(no comment)'}`,
    bodyHtml:
      `<p>Visa request <strong>${esc(ctx.requestNumber)}</strong> has been rejected.</p><blockquote>${esc(ctx.comment ?? '(no comment)')}</blockquote>`,
  }),

  SEND_TO_EMBASSY: (ctx) => ({
    subject: `[VMS] Sent to embassy: ${ctx.requestNumber}`,
    bodyText:
      `Visa request ${ctx.requestNumber} has been submitted to the embassy.\nFees: ${ctx.feesAmount ?? '—'} ${ctx.feesCurrency ?? ''}\n\nWe will notify you once the visas are issued.`,
    bodyHtml:
      `<p>Visa request <strong>${esc(ctx.requestNumber)}</strong> has been submitted to the embassy.</p><p><strong>Fees:</strong> ${esc(ctx.feesAmount)} ${esc(ctx.feesCurrency)}</p><p>We will notify you once the visas are issued.</p>`,
  }),

  COMPLETE: (ctx) => ({
    subject: `[VMS] Request completed: ${ctx.requestNumber}`,
    bodyText:
      `Visa request ${ctx.requestNumber} has been completed. The visas have been finalized and are ready for the office.`,
    bodyHtml:
      `<p>Visa request <strong>${esc(ctx.requestNumber)}</strong> has been completed. The visas have been finalized and are ready for the office.</p>`,
  }),

  DEFAULT: (ctx) => ({
    subject: `[VMS] Request update: ${ctx.requestNumber}`,
    bodyText: `Visa request ${ctx.requestNumber} status has changed to ${ctx.newStatus}.`,
    bodyHtml: `<p>Visa request <strong>${esc(ctx.requestNumber)}</strong> status has changed to <strong>${esc(ctx.newStatus)}</strong>.</p>`,
  }),
};

export function renderTemplate(code: string, ctx: TemplateContext): RenderedTemplate {
  const renderer = TEMPLATES[code] ?? TEMPLATES.DEFAULT;
  return renderer(ctx);
}
