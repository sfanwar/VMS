import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  requestsApi, workflowApi, documentsApi, referenceApi, VisaRequest,
} from '../lib/api';
import DocumentUploader from '../components/DocumentUploader';
import { useTranslation } from '../lib/i18n';
import { useAuth } from '../lib/auth';

const ACTION_VARIANT: Record<string, string> = {
  APPROVE: 'btn',
  VERIFY_OK: 'btn',
  COMPLETE: 'btn',
  SUBMIT_FEES: 'btn',
  SUBMIT: 'btn',
  RESUBMIT: 'btn',
  REJECT: 'btn danger',
  APOLOGIZE: 'btn warning',
  RETURN_TO_OFFICE: 'btn warning',
  RETURN_FOR_CORRECTION: 'btn warning',
};

const COMMENT_REQUIRED = new Set([
  'RETURN_TO_OFFICE', 'RETURN_FOR_CORRECTION', 'APOLOGIZE', 'REJECT',
]);

// Stages at which the Typist captures embassy-issued visa data per beneficiary
// (visa number, issue date, appointment). The visas are uploaded at AT_EMBASSY
// and the request is then worked in TYPIST_FEE_UPDATE before final review.
const VISA_INFO_EDITABLE_STATUSES = new Set(['AT_EMBASSY', 'TYPIST_FEE_UPDATE']);

interface VisaDraft { visaNumber: string; visaIssuedAt: string; appointmentAt: string }
const EMPTY_VISA_DRAFT: VisaDraft = { visaNumber: '', visaIssuedAt: '', appointmentAt: '' };

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { t, lang } = useTranslation();
  const { hasPersona } = useAuth();

  const [request, setRequest] = useState<VisaRequest | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [nextActions, setNextActions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fee editing (Typist only)
  const [feeAmount, setFeeAmount] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('AED');
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeMsg, setFeeMsg] = useState<string | null>(null);

  // Per-beneficiary visa-info editing (Typist only), keyed by beneficiary id
  const [visaDraft, setVisaDraft] = useState<Record<string, VisaDraft>>({});
  const [visaSavingId, setVisaSavingId] = useState<string | null>(null);
  const [visaMsg, setVisaMsg] = useState<string | null>(null);

  // Lookup maps: id -> { nameEn, nameAr }
  const [offices, setOffices] = useState<Record<string, { nameEn: string; nameAr: string }>>({});
  const [contacts, setContacts] = useState<Record<string, { name: string; telephoneNumber: string }>>({});
  const [countries, setCountries] = useState<Record<string, { nameEn: string; nameAr: string }>>({});
  const [visaTypes, setVisaTypes] = useState<Record<string, { nameEn: string; nameAr: string }>>({});

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  // Locale-aware date formatting
  const dateLocale = lang === 'ar' ? 'ar' : 'en-GB';

  useEffect(() => {
    Promise.all([
      referenceApi.offices().catch(() => []),
      referenceApi.countries().catch(() => []),
      referenceApi.visaTypes().catch(() => []),
    ]).then(([off, cn, vt]) => {
      setOffices(Object.fromEntries(off.map((x) => [x.id, { nameEn: x.nameEn, nameAr: x.nameAr }])));
      setContacts(Object.fromEntries(
        off.flatMap((x) => (x.contacts ?? []).map((c) => [c.id, { name: c.name, telephoneNumber: c.telephoneNumber }])),
      ));
      setCountries(Object.fromEntries(cn.map((x) => [x.id, { nameEn: x.nameEn, nameAr: x.nameAr }])));
      setVisaTypes(Object.fromEntries(vt.map((x) => [x.id, { nameEn: x.nameEn, nameAr: x.nameAr }])));
    });
  }, []);

  // Display a bilingual name pulled from a reference map, falling back to a short UUID
  function nameOf(map: Record<string, { nameEn: string; nameAr: string }>, id: string | undefined) {
    if (!id) return <span className="muted">—</span>;
    const entry = map[id];
    if (!entry) return <span className="mono" title={id}>{id.slice(0, 8)}…</span>;
    // Show primary in current language, secondary muted
    return lang === 'ar'
      ? <>{entry.nameAr} <span className="muted" style={{ marginInlineStart: 8 }}>{entry.nameEn}</span></>
      : <>{entry.nameEn} <span className="ar muted">{entry.nameAr}</span></>;
  }

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const [r, h, d] = await Promise.all([
        requestsApi.get(id),
        workflowApi.history(id),
        documentsApi.list(id).catch(() => []),
      ]);
      setRequest(r);
      setHistory(h);
      setDocs(d);
      const next = await workflowApi.nextActions(r.status);
      setNextActions(next.actions);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Seed the visa-info drafts from the loaded beneficiaries (once per id, so a
  // reload after saving doesn't clobber in-progress edits on other rows).
  useEffect(() => {
    if (!request?.beneficiaries) return;
    setVisaDraft((prev) => {
      const next = { ...prev };
      for (const b of request.beneficiaries!) {
        if (!next[b.id]) {
          next[b.id] = {
            visaNumber: b.visaNumber ?? '',
            visaIssuedAt: b.visaIssuedAt ? b.visaIssuedAt.slice(0, 10) : '',
            appointmentAt: b.appointmentAt ? b.appointmentAt.slice(0, 16) : '',
          };
        }
      }
      return next;
    });
  }, [request]);

  function setVisaField(bid: string, field: keyof VisaDraft, value: string) {
    setVisaDraft((prev) => ({
      ...prev,
      [bid]: { ...(prev[bid] ?? EMPTY_VISA_DRAFT), [field]: value },
    }));
  }

  async function saveVisaInfo(bid: string) {
    if (!request) return;
    const d = visaDraft[bid] ?? EMPTY_VISA_DRAFT;
    const body: { visaNumber?: string; visaIssuedAt?: string; appointmentAt?: string } = {};
    if (d.visaNumber.trim()) body.visaNumber = d.visaNumber.trim();
    if (d.visaIssuedAt) body.visaIssuedAt = d.visaIssuedAt;
    // datetime-local has no timezone; normalise to a full ISO string for the API.
    if (d.appointmentAt) body.appointmentAt = new Date(d.appointmentAt).toISOString();
    setVisaSavingId(bid);
    setVisaMsg(null);
    setErr(null);
    try {
      await requestsApi.updateBeneficiaryVisa(request.id, bid, body);
      setVisaMsg(t('detail.visaInfoSaved'));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? t('detail.error'));
    } finally {
      setVisaSavingId(null);
    }
  }

  async function saveFees() {
    if (!request) return;
    const amount = parseFloat(feeAmount);
    if (Number.isNaN(amount) || amount < 0) return;
    setFeeBusy(true);
    setFeeMsg(null);
    setErr(null);
    try {
      await requestsApi.updateFees(request.id, amount, feeCurrency || 'AED');
      setFeeMsg(t('detail.feesUpdated'));
      setFeeAmount('');
      await load();
    } catch (e: any) {
      setErr(e?.message ?? t('detail.error'));
    } finally {
      setFeeBusy(false);
    }
  }

  async function executeAction(action: string) {
    if (COMMENT_REQUIRED.has(action) && !comment.trim()) {
      setPendingAction(action);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await workflowApi.transition(request!.id, action, comment.trim() || undefined);
      setComment('');
      setPendingAction(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!request) {
    return (
      <div>
        {err ? <div className="error-box">{err}</div> : <><span className="spinner"></span>{t('common.loading')}</>}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('detail.pageTitle')}</div>
          <h1 className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem' }}>
            {request.requestNumber}
          </h1>
        </div>
        <div>
          <span className={`badge badge-${request.status}`} style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
            {t(`status.${request.status}`)}
          </span>
        </div>
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="detail-grid">
        <div>
          <div className="card">
            <div className="card-title">{t('detail.fields')}</div>
            <dl className="kv">
              <dt>{t('create.office')}</dt>            <dd>{nameOf(offices, request.officeId)}</dd>
              <dt>{t('create.authorizedPerson')}</dt> <dd>
                {request.officeContactId && contacts[request.officeContactId]
                  ? <>{contacts[request.officeContactId].name}
                      <span className="muted mono" style={{ marginInlineStart: 8 }}>
                        {contacts[request.officeContactId].telephoneNumber}
                      </span></>
                  : <span className="muted">—</span>}
              </dd>
              <dt>{t('create.countryOfVisit')}</dt>   <dd>{nameOf(countries, request.countryOfVisitId)}</dd>
              <dt>{t('create.visaType')}</dt>          <dd>{nameOf(visaTypes, request.visaTypeId)}</dd>
              <dt>{t('list.columnPassengers')}</dt>   <dd>{request.numberOfPassengers}</dd>
              <dt>{t('create.requestDate')}</dt>      <dd>{request.requestDate}</dd>
              <dt>{t('detail.feesSection')}</dt>      <dd>
                {request.feesAmount
                  ? `${request.feesAmount} ${request.feesCurrency ?? 'AED'}`
                  : <span className="muted">—</span>}
              </dd>
            </dl>

            {/* Fee editor — Typist only. The fee endpoint is not status-gated,
                but the Typist fee-update stage is where the typist is expected to
                set fees before forwarding for review. */}
            {hasPersona('TYPIST') && (
              <div className="fee-editor">
                {feeMsg && <div className="success-box" style={{ marginBottom: 8 }}>{feeMsg}</div>}
                <div className="field-row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>{t('detail.feesAmount')}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      placeholder={request.feesAmount ?? '0.00'}
                    />
                  </div>
                  <div className="field" style={{ margin: 0, maxWidth: 120 }}>
                    <label>{t('detail.feesCurrency')}</label>
                    <input
                      value={feeCurrency}
                      onChange={(e) => setFeeCurrency(e.target.value.toUpperCase())}
                      maxLength={3}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={saveFees}
                    disabled={feeBusy || !feeAmount}
                  >
                    {feeBusy ? <><span className="spinner"></span>{t('common.saving')}</> : t('detail.feesUpdate')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">{t('detail.beneficiaries')} ({request.beneficiaries?.length ?? 0})</div>
            {visaMsg && <div className="success-box" style={{ marginBottom: 8 }}>{visaMsg}</div>}
            {request.beneficiaries && request.beneficiaries.length > 0 ? (
              <ol style={{ paddingInlineStart: 20, margin: 0 }}>
                {request.beneficiaries.map((b) => {
                  const draft = visaDraft[b.id] ?? EMPTY_VISA_DRAFT;
                  const canEditVisa = hasPersona('TYPIST') && VISA_INFO_EDITABLE_STATUSES.has(request.status);
                  return (
                    <li key={b.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                      <strong>{b.fullNameEn}</strong>
                      {b.passportNumber && (
                        <span className="muted mono" style={{ marginInlineStart: 12 }}>
                          {t('detail.beneficiaryPassport')}: {b.passportNumber}
                        </span>
                      )}

                      {(b.visaNumber || b.visaIssuedAt || b.appointmentAt) && (
                        <div className="muted mono" style={{ fontSize: '0.78rem', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          {b.visaNumber && <span>{t('detail.beneficiaryVisaNumber')}: {b.visaNumber}</span>}
                          {b.visaIssuedAt && <span>{t('detail.beneficiaryVisaIssued')}: {b.visaIssuedAt.slice(0, 10)}</span>}
                          {b.appointmentAt && <span>{t('detail.beneficiaryAppointment')}: {new Date(b.appointmentAt).toLocaleString(dateLocale)}</span>}
                        </div>
                      )}

                      {canEditVisa && (
                        <div className="field-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>{t('detail.beneficiaryVisaNumber')}</label>
                            <input
                              value={draft.visaNumber}
                              maxLength={50}
                              onChange={(e) => setVisaField(b.id, 'visaNumber', e.target.value)}
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>{t('detail.beneficiaryVisaIssued')}</label>
                            <input
                              type="date"
                              value={draft.visaIssuedAt}
                              onChange={(e) => setVisaField(b.id, 'visaIssuedAt', e.target.value)}
                            />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>{t('detail.beneficiaryAppointment')}</label>
                            <input
                              type="datetime-local"
                              value={draft.appointmentAt}
                              onChange={(e) => setVisaField(b.id, 'appointmentAt', e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => saveVisaInfo(b.id)}
                            disabled={visaSavingId === b.id}
                          >
                            {visaSavingId === b.id
                              ? <><span className="spinner"></span>{t('common.saving')}</>
                              : t('detail.visaInfoSave')}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : <div className="muted">—</div>}
          </div>

          <div className="card">
            <div className="card-title">{t('detail.documents')} ({docs.length})</div>
            {docs.length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <table className="list">
                <thead>
                  <tr>
                    <th>{t('uploader.kindLabel')}</th>
                    <th>{t('uploader.selectFile')}</th>
                    <th>{t('list.columnCreated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="mono" style={{ fontSize: '0.82rem' }}>
                        {t(`uploader.documentKinds.${d.kind}`)}
                      </td>
                      <td>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            documentsApi.download(d.id, d.originalName).catch(err => alert(err.message));
                          }}
                        >
                          {d.originalName}
                        </a>
                        <div className="muted mono" style={{ fontSize: '0.72rem' }}>
                          {(parseInt(d.sizeBytes, 10) / 1024).toFixed(1)} KB
                        </div>
                      </td>
                      <td className="muted mono" style={{ fontSize: '0.82rem' }}>
                        {new Date(d.uploadedAt).toLocaleString(dateLocale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <DocumentUploader
              requestId={request.id}
              status={request.status}
              beneficiaryCount={request.beneficiaries?.length ?? 0}
              uploadedDocs={docs}
              onUploaded={load}
            />
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">{t('detail.actionsSection')}</div>
            {nextActions.length === 0 ? (
              <div className="muted">{t('detail.noActions')}</div>
            ) : (
              <>
                {pendingAction && (
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label>
                      {t('detail.commentLabel')}
                      <span className="muted" style={{ marginInlineStart: 8 }}>
                        ({t('detail.commentRequired')})
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('detail.commentPlaceholder')}
                    />
                  </div>
                )}
                <div className="action-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  {nextActions.map((a) => (
                    <button
                      key={a}
                      className={ACTION_VARIANT[a] ?? 'btn secondary'}
                      onClick={() => executeAction(a)}
                      disabled={busy}
                      style={{ width: '100%', textAlign: 'start' }}
                    >
                      {busy && pendingAction === a && <span className="spinner"></span>}
                      {t(`action.${a}`)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">{t('detail.history')}</div>
            {history.length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <ul className="timeline">
                {history.map((tr, i) => (
                  <li key={tr.id} className={i === history.length - 1 ? 'major' : ''}>
                    <div className="ts">{new Date(tr.occurredAt).toLocaleString(dateLocale)}</div>
                    <div className="what">
                      {tr.fromStatus ? t(`status.${tr.fromStatus}`) : '—'} → {t(`status.${tr.toStatus}`)}
                    </div>
                    <div className="who">
                      <span className="mono">{tr.actorPersona}</span> · <span className="mono">{tr.action}</span>
                    </div>
                    {tr.comment && <div className="comment">"{tr.comment}"</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <hr className="divider-rule" />
      <button className="btn secondary small" onClick={() => nav('/requests')}>
        ← {t('create.backToList')}
      </button>
    </>
  );
}
