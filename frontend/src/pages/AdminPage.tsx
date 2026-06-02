import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';

/** Shell for the SYSADMIN-only administration area: tab nav + nested routes. */
export default function AdminPage() {
  const { t } = useTranslation();
  const tabs = [
    { to: 'users', label: t('admin.tabUsers') },
    { to: 'offices', label: t('admin.tabOffices') },
    { to: 'reference', label: t('admin.tabReference') },
    { to: 'roles', label: t('admin.tabRoles') },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('admin.title')}</div>
          <h1>{t('admin.title')}</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>{t('admin.subtitle')}</p>

      <div className="action-row" style={{ gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map((tb) => (
          <NavLink
            key={tb.to}
            to={tb.to}
            className={({ isActive }) => (isActive ? 'btn small' : 'btn secondary small')}
          >
            {tb.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </>
  );
}
