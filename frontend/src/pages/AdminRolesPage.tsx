import { useEffect, useState } from 'react';
import { adminApi, AdminUser, Persona } from '../lib/api';
import { useTranslation } from '../lib/i18n';

export default function AdminRolesPage() {
  const { t, lang } = useTranslation();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, u] = await Promise.all([adminApi.personas.list(), adminApi.users.list()]);
        setPersonas(p);
        setUsers(u);
      } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    })();
  }, []);

  const holders = (code: string) => users.filter((u) => u.personas.some((p) => p.code === code));

  return (
    <div className="card">
      <div className="card-title">{t('admin.roles.title')}</div>
      <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>{t('admin.roles.subtitle')}</div>
      {err && <div className="error-box">{err}</div>}
      {loading ? (
        <div className="muted"><span className="spinner"></span>{t('admin.loading')}</div>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>{t('admin.roles.role')}</th>
              <th>{t('admin.roles.code')}</th>
              <th>{t('admin.roles.description')}</th>
              <th>{t('admin.roles.members')}</th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const list = holders(p.code);
              return (
                <tr key={p.id}>
                  <td>{lang === 'ar' ? p.nameAr : p.nameEn}</td>
                  <td className="mono" style={{ fontSize: '0.82rem' }}>{p.code}</td>
                  <td className="muted" style={{ fontSize: '0.85rem' }}>{p.description ?? '—'}</td>
                  <td>
                    {list.length === 0 ? <span className="muted">{t('admin.roles.noMembers')}</span> : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {list.map((u) => (
                          <span key={u.id} className="badge badge-SUBMITTED" title={u.email}
                            style={{ opacity: u.isActive ? 1 : 0.5 }}>
                            {u.fullNameEn}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
