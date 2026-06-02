import {
  executeTransition,
  availableActions,
  isTerminal,
  TRANSITION_TABLE,
  RequestStatus,
  WorkflowAction,
  PersonaCode,
} from '../src/state-machine/state-machine';

describe('State machine — executeTransition', () => {

  // ───────────── Positive — every legal transition ─────────────

  describe('legal transitions (one test per row in TRANSITION_TABLE)', () => {
    test.each(TRANSITION_TABLE)(
      'WF-P: %s + %s → %s with persona %s',
      (rule) => {
        const ctx = {
          comment: rule.commentRequired ? 'test comment' : undefined,
          beneficiaryCount: 3,
          documentCounts: {
            OFFICE_LETTER: 1,
            BENEFICIARY_ATTACHMENT: 3,
            EMBASSY_VISA_FORM: 3,
            EMBASSY_LETTER: 1,
            VISA_APPLICATION: 3,
            VISA: 3,
          },
        };
        const result = executeTransition(rule.from, rule.action, [rule.allowedPersonas[0]], ctx);
        expect(result.ok).toBe(true);
        expect(result.newStatus).toBe(rule.to);
      },
    );
  });

  // ───────────── Negative — illegal transitions ─────────────

  describe('illegal transitions', () => {
    it('WF-N-001: DRAFT cannot APPROVE', () => {
      const r = executeTransition('DRAFT', 'APPROVE', ['DIRECTOR']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ILLEGAL_TRANSITION');
    });

    it('WF-N-001: COMPLETED is terminal — nothing changes status', () => {
      const r = executeTransition('COMPLETED', 'SUBMIT', ['OFFICE']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ILLEGAL_TRANSITION');
    });

    it('WF-N-003: cannot skip Director Review from FINAL_VERIFICATION', () => {
      const r = executeTransition('FINAL_VERIFICATION', 'APPROVE', ['DIRECTOR']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ILLEGAL_TRANSITION');
    });

    it('cannot go backward illegally', () => {
      const r = executeTransition('DIRECTOR_REVIEW', 'SUBMIT', ['OFFICE']);
      expect(r.ok).toBe(false);
    });
  });

  // ───────────── Negative — wrong persona ─────────────

  describe('persona enforcement', () => {
    it('WF-N-002: Senior Officer cannot APPROVE (only Director can)', () => {
      const r = executeTransition('DIRECTOR_REVIEW', 'APPROVE', ['SENIOR_OFFICER']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('PERSONA_NOT_AUTHORIZED');
    });

    it('Office cannot start initial verification', () => {
      const r = executeTransition('SUBMITTED', 'START_INITIAL_VERIFY', ['OFFICE']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('PERSONA_NOT_AUTHORIZED');
    });

    it('Office can RESUBMIT a returned request', () => {
      const r = executeTransition('RETURNED_TO_OFFICE', 'RESUBMIT', ['OFFICE']);
      expect(r.ok).toBe(true);
    });

    it('user with multiple personas: any matching persona suffices', () => {
      const r = executeTransition('DIRECTOR_REVIEW', 'APPROVE', ['SENIOR_OFFICER', 'DIRECTOR']);
      expect(r.ok).toBe(true);
    });
  });

  // ───────────── Negative — comment required ─────────────

  describe('comment requirement', () => {
    it('WF-N-004: RETURN_TO_OFFICE requires comment', () => {
      const r = executeTransition('INITIAL_VERIFICATION', 'RETURN_TO_OFFICE', ['SENIOR_ADMIN'], {});
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('COMMENT_REQUIRED');
    });

    it('APOLOGIZE requires comment', () => {
      const r = executeTransition('DIRECTOR_REVIEW', 'APOLOGIZE', ['DIRECTOR'], { comment: '' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('COMMENT_REQUIRED');
    });

    it('REJECT is no longer an allowed action (removed from Director)', () => {
      const r = executeTransition('DIRECTOR_REVIEW', 'REJECT', ['DIRECTOR'], { comment: 'visa policy violation' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ILLEGAL_TRANSITION');
    });

    it('whitespace-only comment is rejected', () => {
      // APOLOGIZE still requires a comment, so it exercises the same validation
      const r = executeTransition('DIRECTOR_REVIEW', 'APOLOGIZE', ['DIRECTOR'], { comment: '   ' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('COMMENT_REQUIRED');
    });
  });

  // ───────────── Negative — document requirements ─────────────

  describe('document requirements', () => {
    it('WF-V-001: SUBMIT requires office letter + per-beneficiary attachments + embassy visa forms', () => {
      const r = executeTransition('DRAFT', 'SUBMIT', ['OFFICE'], {
        beneficiaryCount: 3,
        documentCounts: { OFFICE_LETTER: 1, BENEFICIARY_ATTACHMENT: 2, EMBASSY_VISA_FORM: 3 }, // missing one beneficiary attachment
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('MISSING_DOCUMENTS');
    });

    it('SUBMIT with all docs succeeds', () => {
      const r = executeTransition('DRAFT', 'SUBMIT', ['OFFICE'], {
        beneficiaryCount: 2,
        documentCounts: { OFFICE_LETTER: 1, BENEFICIARY_ATTACHMENT: 2, EMBASSY_VISA_FORM: 2 },
      });
      expect(r.ok).toBe(true);
    });

    it('WF-V-002: FINAL_VERIFICATION VERIFY_OK requires Embassy Letter', () => {
      const r = executeTransition('FINAL_VERIFICATION', 'VERIFY_OK', ['SENIOR_OFFICER'], {
        beneficiaryCount: 1,
        documentCounts: {},
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('MISSING_DOCUMENTS');
    });

    it('SEND_TO_EMBASSY requires one VISA_APPLICATION per beneficiary', () => {
      const r = executeTransition('TYPIST_PROCESSING', 'SEND_TO_EMBASSY', ['TYPIST'], {
        beneficiaryCount: 3,
        documentCounts: { VISA_APPLICATION: 2 },
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('MISSING_DOCUMENTS');
    });

    it('UPLOAD_VISAS requires one VISA per beneficiary', () => {
      const r = executeTransition('AT_EMBASSY', 'UPLOAD_VISAS', ['OFFICE'], {
        beneficiaryCount: 2,
        documentCounts: { VISA: 1 },
      });
      expect(r.ok).toBe(false);
    });

    it('UPLOAD_VISAS no longer allowed directly from WAITING_FOR_EMBASSY', () => {
      // After the embassy persona change, office must wait until embassy processes first
      const r = executeTransition('WAITING_FOR_EMBASSY', 'UPLOAD_VISAS', ['OFFICE'], {
        beneficiaryCount: 2,
        documentCounts: { VISA: 2 },
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('ILLEGAL_TRANSITION');
    });
  });

  // ───────────── Embassy persona — new workflow step ─────────────

  describe('embassy persona', () => {
    it('Embassy can EMBASSY_PROCESS from WAITING_FOR_EMBASSY when the issued visa is attached', () => {
      const r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['EMBASSY'], {
        beneficiaryCount: 2,
        documentCounts: { VISA: 2 },
      });
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('AT_EMBASSY');
    });

    it('EMBASSY_PROCESS requires the issued visa (one per beneficiary)', () => {
      const r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['EMBASSY'], {
        beneficiaryCount: 2,
        documentCounts: { VISA: 1 }, // only one of two issued visas attached
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('MISSING_DOCUMENTS');
    });

    it('EMBASSY_PROCESS with no visa attached is rejected', () => {
      const r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['EMBASSY'], {
        beneficiaryCount: 1,
        documentCounts: {},
      });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('MISSING_DOCUMENTS');
    });

    it('Office cannot EMBASSY_PROCESS', () => {
      const r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['OFFICE']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('PERSONA_NOT_AUTHORIZED');
    });

    it('Typist cannot EMBASSY_PROCESS', () => {
      const r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['TYPIST']);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('PERSONA_NOT_AUTHORIZED');
    });

    it('Embassy cannot SUBMIT or APPROVE (limited scope)', () => {
      expect(executeTransition('DRAFT', 'SUBMIT', ['EMBASSY']).ok).toBe(false);
      expect(executeTransition('DIRECTOR_REVIEW', 'APPROVE', ['EMBASSY']).ok).toBe(false);
    });

    it('After EMBASSY_PROCESS, Office can UPLOAD_VISAS (→ typist fee update)', () => {
      const r = executeTransition('AT_EMBASSY', 'UPLOAD_VISAS', ['OFFICE'], {
        beneficiaryCount: 2,
        documentCounts: { VISA: 2 },
      });
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('TYPIST_FEE_UPDATE');
    });

    it('Typist can also UPLOAD_VISAS from AT_EMBASSY (backup path for office)', () => {
      const r = executeTransition('AT_EMBASSY', 'UPLOAD_VISAS', ['TYPIST'], {
        beneficiaryCount: 1,
        documentCounts: { VISA: 1 },
      });
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('TYPIST_FEE_UPDATE');
    });

    it('Typist forwards from TYPIST_FEE_UPDATE to WAITING_FINAL_REVIEW via SUBMIT_FEES', () => {
      const r = executeTransition('TYPIST_FEE_UPDATE', 'SUBMIT_FEES', ['TYPIST']);
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('WAITING_FINAL_REVIEW');
    });

    it('Office cannot SUBMIT_FEES (typist only)', () => {
      const r = executeTransition('TYPIST_FEE_UPDATE', 'SUBMIT_FEES', ['OFFICE']);
      expect(r.ok).toBe(false);
    });

    it('Typist can RETURN_FOR_CORRECTION from TYPIST_FEE_UPDATE back to AT_EMBASSY', () => {
      const r = executeTransition('TYPIST_FEE_UPDATE', 'RETURN_FOR_CORRECTION', ['TYPIST'], { comment: 'wrong visa scan' });
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('AT_EMBASSY');
    });

    it('RETURN_FOR_CORRECTION from TYPIST_FEE_UPDATE requires a comment', () => {
      const r = executeTransition('TYPIST_FEE_UPDATE', 'RETURN_FOR_CORRECTION', ['TYPIST'], { comment: '  ' });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('COMMENT_REQUIRED');
    });

    it('Senior Officer can RETURN_FOR_CORRECTION from WAITING_FINAL_REVIEW to TYPIST_FEE_UPDATE', () => {
      const r = executeTransition('WAITING_FINAL_REVIEW', 'RETURN_FOR_CORRECTION', ['SENIOR_OFFICER'], { comment: 'fee mismatch' });
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('TYPIST_FEE_UPDATE');
    });

    it('Typist cannot COMPLETE at WAITING_FINAL_REVIEW (senior officer only)', () => {
      const r = executeTransition('WAITING_FINAL_REVIEW', 'COMPLETE', ['TYPIST']);
      expect(r.ok).toBe(false);
    });

    it('Typist can REASSIGN_TO_SELF from AT_EMBASSY', () => {
      const r = executeTransition('AT_EMBASSY', 'REASSIGN_TO_SELF', ['TYPIST']);
      expect(r.ok).toBe(true);
      expect(r.newStatus).toBe('AT_EMBASSY');
    });
  });

  // ───────────── Full happy path including embassy ─────────────

  describe('E2E full workflow with embassy', () => {
    it('walks DRAFT through to COMPLETED via the embassy', () => {
      const submitDocs = {
        documentCounts: { OFFICE_LETTER: 1, BENEFICIARY_ATTACHMENT: 1, EMBASSY_VISA_FORM: 1 },
        beneficiaryCount: 1,
      };
      let r = executeTransition('DRAFT', 'SUBMIT', ['OFFICE'], submitDocs);
      expect(r.newStatus).toBe('SUBMITTED');

      r = executeTransition('SUBMITTED', 'START_INITIAL_VERIFY', ['SENIOR_ADMIN']);
      expect(r.newStatus).toBe('INITIAL_VERIFICATION');

      r = executeTransition('INITIAL_VERIFICATION', 'VERIFY_OK', ['SENIOR_ADMIN']);
      expect(r.newStatus).toBe('FINAL_VERIFICATION');

      r = executeTransition('FINAL_VERIFICATION', 'VERIFY_OK', ['SENIOR_OFFICER'], {
        beneficiaryCount: 1,
        documentCounts: { EMBASSY_LETTER: 1 },
      });
      expect(r.newStatus).toBe('DIRECTOR_REVIEW');

      r = executeTransition('DIRECTOR_REVIEW', 'APPROVE', ['DIRECTOR']);
      expect(r.newStatus).toBe('TYPIST_PROCESSING');

      r = executeTransition('TYPIST_PROCESSING', 'SEND_TO_EMBASSY', ['TYPIST'], {
        beneficiaryCount: 1,
        documentCounts: { VISA_APPLICATION: 1 },
      });
      expect(r.newStatus).toBe('WAITING_FOR_EMBASSY');

      r = executeTransition('WAITING_FOR_EMBASSY', 'EMBASSY_PROCESS', ['EMBASSY'], {
        beneficiaryCount: 1,
        documentCounts: { VISA: 1 },
      });
      expect(r.newStatus).toBe('AT_EMBASSY');

      r = executeTransition('AT_EMBASSY', 'UPLOAD_VISAS', ['OFFICE'], {
        beneficiaryCount: 1,
        documentCounts: { VISA: 1 },
      });
      expect(r.newStatus).toBe('TYPIST_FEE_UPDATE');

      r = executeTransition('TYPIST_FEE_UPDATE', 'SUBMIT_FEES', ['TYPIST']);
      expect(r.newStatus).toBe('WAITING_FINAL_REVIEW');

      r = executeTransition('WAITING_FINAL_REVIEW', 'COMPLETE', ['SENIOR_OFFICER']);
      expect(r.newStatus).toBe('COMPLETED');
    });
  });

  // ───────────── E2E-002: returned and resubmit ─────────────

  describe('E2E-002: returned and resubmit', () => {
    it('flows DRAFT → SUBMITTED → INITIAL_VERIFICATION → RETURNED_TO_OFFICE → SUBMITTED', () => {
      const docs = {
        documentCounts: { OFFICE_LETTER: 1, BENEFICIARY_ATTACHMENT: 1, EMBASSY_VISA_FORM: 1 },
        beneficiaryCount: 1,
      };
      let r = executeTransition('DRAFT', 'SUBMIT', ['OFFICE'], docs);
      expect(r.newStatus).toBe('SUBMITTED');

      r = executeTransition('SUBMITTED', 'START_INITIAL_VERIFY', ['SENIOR_ADMIN']);
      expect(r.newStatus).toBe('INITIAL_VERIFICATION');

      r = executeTransition('INITIAL_VERIFICATION', 'RETURN_TO_OFFICE', ['SENIOR_ADMIN'], { comment: 'missing passport' });
      expect(r.newStatus).toBe('RETURNED_TO_OFFICE');

      r = executeTransition('RETURNED_TO_OFFICE', 'RESUBMIT', ['OFFICE']);
      expect(r.newStatus).toBe('SUBMITTED');
    });
  });

  // ───────────── availableActions ─────────────

  describe('availableActions', () => {
    it('returns actions filtered by persona', () => {
      const actions = availableActions('DIRECTOR_REVIEW', ['DIRECTOR']);
      expect(actions).toContain('APPROVE');
      expect(actions).not.toContain('REJECT'); // REJECT removed from Director
      expect(actions).toContain('APOLOGIZE');
      expect(actions).toContain('RETURN_FOR_CORRECTION');
    });

    it('returns nothing for wrong persona', () => {
      expect(availableActions('DIRECTOR_REVIEW', ['OFFICE'])).toEqual([]);
    });

    it('multiple personas — actions from any matching persona', () => {
      const actions = availableActions('SUBMITTED', ['OFFICE', 'SENIOR_ADMIN']);
      expect(actions).toContain('START_INITIAL_VERIFY');
    });
  });

  // ───────────── SYSADMIN — outside the workflow ─────────────

  describe('SYSADMIN persona', () => {
    const allStatuses = Array.from(new Set(TRANSITION_TABLE.flatMap((r) => [r.from, r.to])));

    it('has no available action in any state (admin role is outside the workflow)', () => {
      for (const status of allStatuses) {
        expect(availableActions(status, ['SYSADMIN'])).toEqual([]);
      }
    });

    it('cannot perform any transition', () => {
      for (const rule of TRANSITION_TABLE) {
        const r = executeTransition(rule.from, rule.action, ['SYSADMIN'], { comment: 'x', beneficiaryCount: 0 });
        expect(r.ok).toBe(false);
      }
    });
  });

  // ───────────── isTerminal ─────────────

  describe('isTerminal', () => {
    it.each(['COMPLETED', 'APOLOGIZED', 'REJECTED'])('%s is terminal', (s) => {
      expect(isTerminal(s as RequestStatus)).toBe(true);
    });
    it.each(['DRAFT', 'SUBMITTED', 'DIRECTOR_REVIEW', 'WAITING_FOR_EMBASSY', 'AT_EMBASSY'])('%s is not terminal', (s) => {
      expect(isTerminal(s as RequestStatus)).toBe(false);
    });
  });
});
