import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTranslation, Lang } from '../lib/i18n';
import { useTheme, ThemeId } from '../lib/theme';
import { useIdleTimeout } from '../lib/useIdleTimeout';

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useTranslation();
  const { theme, themes, setTheme } = useTheme();

  // Auto-logout after 30 minutes of inactivity (configurable).
  useIdleTimeout(() => { if (user) logout(); }, 30);
  const canCreateRequest = user?.personas.some(
    (p) => p.code === 'OFFICE' || p.code === 'SENIOR_ADMIN',
  ) ?? false;
  const isSysadmin = user?.personas.some((p) => p.code === 'SYSADMIN') ?? false;

  function switchLang(next: Lang) {
    if (next !== lang) setLang(next);
  }

  return (
    <div className="app-shell">
      <div className="classification-banner">{t('app.classification')}</div>

      <header className="topbar">
        <Link to="/requests" className="brand" style={{ borderBottom: 'none', color: 'inherit' }}>
          <span className="crest">V</span>
          {t('app.name')}
        </Link>

        <nav>
          <NavLink to="/requests" className={({ isActive }) => isActive ? 'active' : ''}>
            {t('nav.requests')}
          </NavLink>
          {canCreateRequest && (
            <NavLink to="/requests/new" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.newRequest')}
            </NavLink>
          )}
          {isSysadmin && (
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.admin')}
            </NavLink>
          )}
        </nav>

        <div className="userchip">
          {/* Theme switcher */}
          <select
            className="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
            aria-label={t('nav.theme')}
            title={t('nav.theme')}
          >
            {themes.map((th) => (
              <option key={th.id} value={th.id}>{t(th.labelKey)}</option>
            ))}
          </select>

          {/* Language switcher — small chip group */}
          <div className="lang-switch" role="group" aria-label={t('nav.language')}>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => switchLang('en')}
              aria-pressed={lang === 'en'}
            >
              EN
            </button>
            <button
              type="button"
              className={lang === 'ar' ? 'active' : ''}
              onClick={() => switchLang('ar')}
              aria-pressed={lang === 'ar'}
              lang="ar"
            >
              ع
            </button>
          </div>

          {user && (
            <>
              <span>
                {user.fullNameEn}
                <span className="muted" style={{ marginInlineStart: 8 }}>
                  · {user.personas.map((p) => p.code).join(', ') || t('nav.noRole')}
                </span>
              </span>
              <button onClick={() => logout()}>{t('nav.signOut')}</button>
            </>
          )}
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer>{t('app.footer')}</footer>
    </div>
  );
}
