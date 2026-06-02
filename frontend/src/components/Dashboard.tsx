import { useMemo } from 'react';
import { VisaRequest } from '../lib/api';
import { useTranslation } from '../lib/i18n';

// ───────────────────────────────────────────────────────────
// Colour palette for charts — derived from the project tokens
// (so dashboard graphs feel like part of the rest of the UI)
// ───────────────────────────────────────────────────────────
const C = {
  teal: '#0D3B3A',
  tealSoft: '#1A5957',
  gold: '#C9A857',
  goldSoft: '#E8D9AE',
  paper: '#F4EED8',
  ink: '#1F2937',
  inkFaint: '#6B7280',
  line: '#D1D5DB',
  green: '#2A5D3A',
  amber: '#B7791F',
  red: '#9B2C2C',
  slate: '#4B5563',
};

// Each request status maps to one of the palette colours so the legend on the
// donut and the badges in the table read consistently.
const STATUS_COLORS: Record<string, string> = {
  DRAFT:                 C.inkFaint,
  SUBMITTED:             C.gold,
  INITIAL_VERIFICATION:  C.gold,
  FINAL_VERIFICATION:    C.tealSoft,
  DIRECTOR_REVIEW:       C.amber,
  TYPIST_PROCESSING:     C.tealSoft,
  WAITING_FOR_EMBASSY:   C.teal,
  AT_EMBASSY:            C.teal,
  TYPIST_FEE_UPDATE:     C.tealSoft,
  WAITING_FINAL_REVIEW:  C.tealSoft,
  COMPLETED:             C.green,
  RETURNED_TO_OFFICE:    C.amber,
  APOLOGIZED:            C.slate,
  REJECTED:              C.red,
};

// Statuses considered "in progress" vs "terminal" — drives the KPI cards.
const TERMINAL_STATUSES = new Set(['COMPLETED', 'APOLOGIZED', 'REJECTED']);

interface DashboardProps {
  requests: VisaRequest[];
  /** id → { nameEn, nameAr } for the top-destinations chart */
  countries: Record<string, { nameEn: string; nameAr: string }>;
  loading?: boolean;
}

export default function Dashboard({ requests, countries, loading }: DashboardProps) {
  const { t, lang } = useTranslation();

  // ── Pre-computed stats: re-derive only when the inputs change ──
  const stats = useMemo(() => computeStats(requests), [requests]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <span className="spinner" />
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <section className="dashboard" aria-label={t('dashboard.title')}>
      <header className="dashboard-head">
        <div>
          <div className="kicker">{t('dashboard.title')}</div>
          <p className="dashboard-sub">{t('dashboard.subtitle')}</p>
        </div>
      </header>

      <div className="kpi-grid">
        <KpiCard label={t('dashboard.kpiTotal')}      value={stats.total}      tone="default" />
        <KpiCard label={t('dashboard.kpiInProgress')} value={stats.inProgress} tone="teal" />
        <KpiCard label={t('dashboard.kpiCompleted')}  value={stats.completed}  tone="green" />
        <KpiCard label={t('dashboard.kpiReturned')}   value={stats.returned}   tone="amber" />
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <div className="card-title">{t('dashboard.statusBreakdown')}</div>
          {stats.total === 0
            ? <div className="muted chart-empty">{t('dashboard.statusEmpty')}</div>
            : <StatusDonut byStatus={stats.byStatus} total={stats.total} t={t} />
          }
        </div>

        <div className="card chart-card">
          <div className="card-title">{t('dashboard.activity')}</div>
          {stats.activitySum === 0
            ? <div className="muted chart-empty">{t('dashboard.activityEmpty')}</div>
            : <ActivityChart series={stats.activity} t={t} lang={lang} />
          }
        </div>

        <div className="card chart-card">
          <div className="card-title">{t('dashboard.topCountries')}</div>
          {stats.byCountry.length === 0
            ? <div className="muted chart-empty">{t('dashboard.topCountriesEmpty')}</div>
            : <TopCountries data={stats.byCountry} countries={countries} lang={lang} />
          }
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// Stats computation — pure, deterministic, easy to test
// ═══════════════════════════════════════════════════════════
function computeStats(requests: VisaRequest[]) {
  const byStatus: Record<string, number> = {};
  const byCountryMap: Record<string, number> = {};

  for (const r of requests) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.countryOfVisitId) {
      byCountryMap[r.countryOfVisitId] = (byCountryMap[r.countryOfVisitId] ?? 0) + 1;
    }
  }

  const total = requests.length;
  const completed = byStatus.COMPLETED ?? 0;
  const returned  = byStatus.RETURNED_TO_OFFICE ?? 0;
  // "In progress" = anything not in a terminal state and not currently returned
  const inProgress = requests.filter(r => !TERMINAL_STATUSES.has(r.status) && r.status !== 'RETURNED_TO_OFFICE').length;

  // Activity: count of requests created on each of the last 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: Date; count: number; iso: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({ date: d, count: 0, iso: d.toISOString().slice(0, 10) });
  }
  const dayIndex = new Map(days.map((d, i) => [d.iso, i]));
  for (const r of requests) {
    if (!r.createdAt) continue;
    const iso = new Date(r.createdAt).toISOString().slice(0, 10);
    const idx = dayIndex.get(iso);
    if (idx !== undefined) days[idx].count += 1;
  }
  const activitySum = days.reduce((s, d) => s + d.count, 0);

  // Top 5 countries by request count
  const byCountry = Object.entries(byCountryMap)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total, completed, returned, inProgress,
    byStatus,
    activity: days,
    activitySum,
    byCountry,
  };
}

// ═══════════════════════════════════════════════════════════
// KPI card
// ═══════════════════════════════════════════════════════════
function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'default' | 'teal' | 'green' | 'amber' }) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Status donut chart
// ═══════════════════════════════════════════════════════════
function StatusDonut({ byStatus, total, t }: { byStatus: Record<string, number>; total: number; t: (k: string) => string }) {
  // Use a 200×200 viewBox so the SVG can scale freely with its container.
  const SIZE = 200;
  const R_OUTER = 88;
  const R_INNER = 58;
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  // Sort segments by count descending for stable, readable ordering
  const segments = Object.entries(byStatus)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Walk around the circle accumulating arc lengths
  let acc = 0;
  const paths = segments.map(({ status, count }) => {
    const fraction = count / total;
    const start = acc;
    const end = acc + fraction;
    acc = end;
    return {
      status, count,
      path: donutSlicePath(CX, CY, R_OUTER, R_INNER, start, end),
      color: STATUS_COLORS[status] ?? C.inkFaint,
    };
  });

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut" role="img" aria-label={t('dashboard.statusBreakdown')}>
        {paths.map(p => (
          <path key={p.status} d={p.path} fill={p.color} stroke="#fff" strokeWidth="1.5">
            <title>{`${t(`status.${p.status}`)}: ${p.count}`}</title>
          </path>
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="28" fontWeight="700" fill={C.teal}>{total}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fill={C.inkFaint}>{t('dashboard.kpiTotal')}</text>
      </svg>
      <ul className="donut-legend">
        {paths.map(p => (
          <li key={p.status}>
            <span className="dot" style={{ background: p.color }} />
            <span className="legend-label">{t(`status.${p.status}`)}</span>
            <span className="legend-count">{p.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Standard SVG arc-path generation for a donut slice
// fractionStart / fractionEnd are 0..1 of the full circle, measured clockwise from 12 o'clock.
function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, fractionStart: number, fractionEnd: number): string {
  const TWO_PI = Math.PI * 2;
  const a0 = fractionStart * TWO_PI - Math.PI / 2;
  const a1 = fractionEnd * TWO_PI - Math.PI / 2;
  const largeArc = (fractionEnd - fractionStart) > 0.5 ? 1 : 0;

  const x0Outer = cx + rOuter * Math.cos(a0);
  const y0Outer = cy + rOuter * Math.sin(a0);
  const x1Outer = cx + rOuter * Math.cos(a1);
  const y1Outer = cy + rOuter * Math.sin(a1);
  const x0Inner = cx + rInner * Math.cos(a1);
  const y0Inner = cy + rInner * Math.sin(a1);
  const x1Inner = cx + rInner * Math.cos(a0);
  const y1Inner = cy + rInner * Math.sin(a0);

  // Handle the degenerate "100% one status" case by drawing two semicircles
  if (fractionEnd - fractionStart >= 0.999) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy + rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter}`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy + rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${x0Outer} ${y0Outer}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x1Outer} ${y1Outer}`,
    `L ${x0Inner} ${y0Inner}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}`,
    'Z',
  ].join(' ');
}

// ═══════════════════════════════════════════════════════════
// Activity area chart — last 30 days, daily new requests
// ═══════════════════════════════════════════════════════════
function ActivityChart({ series, t, lang }: { series: { date: Date; count: number }[]; t: (k: string) => string; lang: string }) {
  const W = 520;
  const H = 180;
  const PAD_L = 28;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxRaw = Math.max(1, ...series.map(s => s.count));
  // Round up to a "nice" max — 1, 2, 5, 10, 20, 50, 100…
  const max = niceCeiling(maxRaw);
  const stepX = innerW / Math.max(1, series.length - 1);

  // Path data and area fill
  const linePoints = series.map((s, i) => [PAD_L + i * stepX, PAD_T + innerH - (s.count / max) * innerH] as const);
  const linePath = linePoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L ${(PAD_L + (series.length - 1) * stepX).toFixed(1)} ${PAD_T + innerH} L ${PAD_L.toFixed(1)} ${PAD_T + innerH} Z`;

  // Y-axis grid lines — 4 horizontal rules at 0/¼/½/¾/max
  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];

  const dateLocale = lang === 'ar' ? 'ar' : 'en-GB';
  // X-axis labels: only show every Nth day to avoid crowding
  const labelEvery = Math.ceil(series.length / 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="activity-chart" role="img" aria-label={t('dashboard.activity')}>
      {/* Y grid */}
      {yTicks.map((v, i) => {
        const y = PAD_T + innerH - (v / max) * innerH;
        return (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={C.line} strokeDasharray={i === 0 ? '0' : '2 3'} strokeWidth="0.5" />
            <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="9" fill={C.inkFaint}>{Math.round(v)}</text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={C.teal} fillOpacity="0.10" />
      {/* Line */}
      <path d={linePath} fill="none" stroke={C.teal} strokeWidth="1.8" strokeLinejoin="round" />

      {/* Data points */}
      {series.map((s, i) => {
        const [x, y] = linePoints[i];
        return (
          <circle key={i} cx={x} cy={y} r={s.count > 0 ? 2.5 : 1.5}
                  fill={s.count > 0 ? C.gold : C.line}
                  stroke="#fff" strokeWidth="1">
            <title>{`${s.date.toLocaleDateString(dateLocale)}: ${s.count} ${t('dashboard.activityNewRequests')}`}</title>
          </circle>
        );
      })}

      {/* X-axis tick labels */}
      {series.map((s, i) => {
        if (i % labelEvery !== 0 && i !== series.length - 1) return null;
        const x = PAD_L + i * stepX;
        const label = s.date.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' });
        return (
          <text key={i} x={x} y={H - PAD_B + 18} textAnchor="middle" fontSize="9" fill={C.inkFaint}>{label}</text>
        );
      })}
    </svg>
  );
}

/** Round up to a visually pleasing scale boundary so the Y axis ticks read as round numbers */
function niceCeiling(n: number): number {
  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  // Round up to the next 100
  return Math.ceil(n / 100) * 100;
}

// ═══════════════════════════════════════════════════════════
// Top countries — horizontal bar chart
// ═══════════════════════════════════════════════════════════
function TopCountries({ data, countries, lang }: {
  data: { id: string; count: number }[];
  countries: Record<string, { nameEn: string; nameAr: string }>;
  lang: string;
}) {
  const maxCount = Math.max(1, ...data.map(d => d.count));

  function labelFor(id: string): string {
    const c = countries[id];
    if (!c) return id.slice(0, 6) + '…';
    return lang === 'ar' ? c.nameAr : c.nameEn;
  }

  return (
    <ul className="hbar-chart">
      {data.map(d => {
        const pct = (d.count / maxCount) * 100;
        return (
          <li key={d.id}>
            <span className="hbar-label">{labelFor(d.id)}</span>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="hbar-count">{d.count}</span>
          </li>
        );
      })}
    </ul>
  );
}
