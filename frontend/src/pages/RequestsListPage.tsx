import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestsApi, referenceApi, workflowApi, VisaRequest } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';
import Dashboard from '../components/Dashboard';

const STATUS_CODES = [
  '', 'DRAFT', 'SUBMITTED', 'INITIAL_VERIFICATION', 'FINAL_VERIFICATION',
  'DIRECTOR_REVIEW', 'TYPIST_PROCESSING', 'WAITING_FOR_EMBASSY', 'AT_EMBASSY', 'TYPIST_FEE_UPDATE',
  'WAITING_FINAL_REVIEW', 'COMPLETED', 'RETURNED_TO_OFFICE', 'APOLOGIZED', 'REJECTED',
] as const;

export default function RequestsListPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const canCreate = user?.personas.some((p) => p.code === 'OFFICE' || p.code === 'SENIOR_ADMIN') ?? false;

  // Two separate data buckets:
  //   `allForDashboard` — up to 1000 requests, used to compute KPIs and charts
  //   `items` — paginated, status-filtered, used in the table
  const [allForDashboard, setAllForDashboard] = useState<VisaRequest[]>([]);
  const [items, setItems] = useState<VisaRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDash, setShowDash] = useState(true);

  // Country names for the "Top destinations" chart
  const [countries, setCountries] = useState<Record<string, { nameEn: string; nameAr: string }>>({});
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Workflow state machine — used to derive, per status, which persona(s) the
  // request is currently pending with (the actors who can move it forward).
  const [stateMachine, setStateMachine] =
    useState<{ transitions: { from: string; to: string; allowedPersonas: string[] }[] } | null>(null);

  // status -> personas it is pending with. Built from the transition table so it
  // never drifts from the workflow rules. Self-loops (e.g. REASSIGN_TO_SELF) are
  // excluded — they don't hand the request to a different actor. Terminal states
  // (COMPLETED / APOLOGIZED / REJECTED) have no outgoing transitions → not pending.
  const pendingByStatus = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tr of stateMachine?.transitions ?? []) {
      if (tr.from === tr.to) continue;
      const set = new Set(map[tr.from] ?? []);
      tr.allowedPersonas.forEach((p) => set.add(p));
      map[tr.from] = Array.from(set);
    }
    return map;
  }, [stateMachine]);

  // Rebuild status filter labels on language change
  const statusFilters = useMemo(() =>
    STATUS_CODES.map((code) => ({
      value: code,
      label: code === '' ? t('list.allStatuses') : t(`status.${code}`),
    })),
    [t],
  );

  const dateLocale = lang === 'ar' ? 'ar' : 'en-GB';

  // Load all-for-dashboard + reference data once
  useEffect(() => {
    (async () => {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const [all, ctrs] = await Promise.all([
          requestsApi.list({ pageSize: 1000 }),
          referenceApi.countries().catch(() => []),
        ]);
        setAllForDashboard(all.items ?? []);
        setCountries(Object.fromEntries(ctrs.map((c) => [c.id, { nameEn: c.nameEn, nameAr: c.nameAr }])));
      } catch (e: any) {
        // Surface the error rather than silently rendering an empty dashboard.
        // The previous "silent fail" behaviour hid genuine bugs (e.g. backend
        // validation errors on pageSize, missing auth) behind empty charts.
        console.error('Dashboard load failed:', e);
        setDashboardError(e?.message ?? 'Failed to load dashboard data');
        setAllForDashboard([]);
      } finally {
        setDashboardLoading(false);
      }
    })();
  }, []);

  // Filtered list reload on status change
  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await requestsApi.list({ status: status || undefined, pageSize: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [status]);

  // Load the workflow state machine once (static graph).
  useEffect(() => {
    workflowApi.stateMachine().then(setStateMachine).catch(() => setStateMachine(null));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('list.filterLabel')}</div>
          <h1>{t('list.pageTitle')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => setShowDash((s) => !s)}
          >
            {showDash ? t('dashboard.hideDashboard') : t('dashboard.showDashboard')}
          </button>
          {canCreate && <Link to="/requests/new" className="btn">+ {t('list.newRequestButton')}</Link>}
        </div>
      </div>

      {showDash && (
        <>
          {dashboardError && (
            <div className="error-box" style={{ marginBottom: 12 }}>
              {dashboardError}
            </div>
          )}
          <Dashboard
            requests={allForDashboard}
            countries={countries}
            loading={dashboardLoading}
          />
        </>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="field" style={{ margin: 0, minWidth: 240 }}>
            <label htmlFor="status">{t('list.filterLabel')}</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusFilters.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="muted mono" style={{ fontSize: '0.82rem' }}>
            {loading ? <><span className="spinner"></span>{t('list.loading')}</> : t('list.countSummary', { count: total })}
          </div>
        </div>

        {err && <div className="error-box">{err}</div>}

        <table className="list">
          <thead>
            <tr>
              <th>{t('list.columnNumber')}</th>
              <th>{t('list.columnStatus')}</th>
              <th>{t('list.columnPendingWith')}</th>
              <th>{t('list.columnPassengers')}</th>
              <th>{t('list.columnCreated')}</th>
              <th>{t('detail.feesSection')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr><td colSpan={6} className="empty">{t('list.emptyTitle')}</td></tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} onClick={() => nav(`/requests/${r.id}`)}>
                  <td className="reqnum">{r.requestNumber}</td>
                  <td><span className={`badge badge-${r.status}`}>{t(`status.${r.status}`)}</span></td>
                  <td>
                    {(pendingByStatus[r.status]?.length ?? 0) > 0
                      ? pendingByStatus[r.status].map((p) => t(`persona.${p}`)).join(' / ')
                      : <span className="muted">—</span>}
                  </td>
                  <td>{r.numberOfPassengers}</td>
                  <td className="muted mono" style={{ fontSize: '0.85rem' }}>
                    {new Date(r.createdAt).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="mono">
                    {r.feesAmount ? `${r.feesAmount} ${r.feesCurrency ?? ''}` : <span className="muted">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
