import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, lang, setLang } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as any)?.from ?? '/requests';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (e: any) {
      const code = e?.errorCode;
      // Try to map a backend error code; fall back to message; fall back to a generic string.
      setErr(
        (code && (t(`errors.${code}`) !== `errors.${code}` ? t(`errors.${code}`) : null)) ||
        e?.message ||
        t('login.signInFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="left">
        <div>
          <div className="meta">{t('login.department')}</div>
          <div className="crest-large">Visa<span>Mgmt</span></div>
        </div>

        <div className="tagline">{t('login.tagline')}</div>

        <div className="meta">{t('login.confidentialBadge')}</div>
      </div>

      <div className="right">
        {/* Compact language switcher above the form so users can pick before signing in */}
        <div className="lang-switch lang-switch-floating" role="group" aria-label={t('nav.language')}>
          <button
            type="button"
            className={lang === 'en' ? 'active' : ''}
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
          >
            EN
          </button>
          <button
            type="button"
            className={lang === 'ar' ? 'active' : ''}
            onClick={() => setLang('ar')}
            aria-pressed={lang === 'ar'}
            lang="ar"
          >
            ع
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="heading">{t('login.heading')}</div>
          <div className="sub">{t('login.sub')}</div>

          {err && <div className="error-box">{err}</div>}

          <div className="field">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner"></span>}
            {t('login.signInButton')}
          </button>

          <div className="hint-accounts">
            <h4>{t('login.seededHeading', { password: 'Passw0rd!' })}</h4>
            <div><code>office.user@office1.local</code> — {t('login.rolesOffice')}</div>
            <div><code>senior.admin@fad.local</code> — {t('login.rolesSeniorAdmin')}</div>
            <div><code>senior.officer@fad.local</code> — {t('login.rolesSeniorOfficer')}</div>
            <div><code>director@fad.local</code> — {t('login.rolesDirector')}</div>
            <div><code>typist@fad.local</code> — {t('login.rolesTypist')}</div>
            <div><code>embassy.user@embassy.local</code> — {t('login.rolesEmbassy')}</div>
            <div><code>sysadmin@fad.local</code> — {t('login.rolesSysadmin')}</div>
          </div>
        </form>
      </div>
    </div>
  );
}
