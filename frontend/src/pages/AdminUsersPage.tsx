import { useEffect, useState, FormEvent } from 'react';
import { adminApi, referenceApi, AdminUser, Persona, Office } from '../lib/api';
import { useTranslation } from '../lib/i18n';

const EMPTY_FORM = { email: '', password: '', fullNameEn: '', fullNameAr: '', officeId: '', personaCodes: [] as string[] };

export default function AdminUsersPage() {
  const { t, lang } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const officeName = (id?: string) => {
    if (!id) return <span className="muted">{t('admin.users.noOffice')}</span>;
    const o = offices.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.nameAr : o.nameEn) : <span className="mono">{id.slice(0, 8)}…</span>;
  };

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [u, p, o] = await Promise.all([
        adminApi.users.list(),
        adminApi.personas.list(),
        referenceApi.offices().catch(() => []),
      ]);
      setUsers(u);
      setPersonas(p);
      setOffices(o);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setMsg(null);
  }

  function openEdit(u: AdminUser) {
    setEditingId(u.id);
    setForm({
      email: u.email,
      password: '',
      fullNameEn: u.fullNameEn,
      fullNameAr: u.fullNameAr ?? '',
      officeId: u.officeId ?? '',
      personaCodes: u.personas.map((p) => p.code),
    });
    setShowForm(true);
    setMsg(null);
  }

  function toggleRole(code: string) {
    setForm((f) => ({
      ...f,
      personaCodes: f.personaCodes.includes(code)
        ? f.personaCodes.filter((c) => c !== code)
        : [...f.personaCodes, code],
    }));
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (editingId) {
        await adminApi.users.update(editingId, {
          fullNameEn: form.fullNameEn,
          fullNameAr: form.fullNameAr || undefined,
          officeId: form.officeId || undefined,
          personaCodes: form.personaCodes,
        });
        setMsg(t('admin.users.userUpdated'));
      } else {
        await adminApi.users.create({
          email: form.email,
          password: form.password,
          fullNameEn: form.fullNameEn,
          fullNameAr: form.fullNameAr || undefined,
          officeId: form.officeId || undefined,
          personaCodes: form.personaCodes,
        });
        setMsg(t('admin.users.userCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    if (u.isActive && !window.confirm(t('admin.users.confirmDeactivate'))) return;
    setErr(null);
    try {
      await adminApi.users.update(u.id, { isActive: !u.isActive });
      await load();
    } catch (e: any) { setErr(e.message); }
  }

  async function resetPassword(u: AdminUser) {
    const pw = window.prompt(`${t('admin.users.newPassword')} — ${t('admin.users.passwordPolicy')}`);
    if (!pw) return;
    setErr(null);
    try {
      await adminApi.users.resetPassword(u.id, pw);
      setMsg(`${t('admin.users.passwordReset')}: ${u.email}`);
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div className="card-title">{t('admin.users.title')}</div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t('admin.users.subtitle')}</div>
        </div>
        <button className="btn small" onClick={openCreate}>+ {t('admin.users.newUser')}</button>
      </div>

      {err && <div className="error-box">{err}</div>}
      {msg && <div className="success-box" style={{ marginBottom: 8 }}>{msg}</div>}

      {showForm && (
        <form onSubmit={submitForm} className="card" style={{ background: 'var(--surface-2, #fafafa)' }}>
          <div className="card-title">{editingId ? t('admin.users.editTitle') : t('admin.users.createTitle')}</div>
          <div className="field-row">
            <div className="field">
              <label>{t('admin.users.email')}</label>
              <input type="email" value={form.email} disabled={!!editingId}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            {!editingId && (
              <div className="field">
                <label>{t('admin.users.password')}</label>
                <input type="text" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                <div className="hint">{t('admin.users.passwordPolicy')}</div>
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field">
              <label>{t('admin.users.fullNameEn')}</label>
              <input value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} required />
            </div>
            <div className="field">
              <label>{t('admin.users.fullNameAr')}</label>
              <input value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>{t('admin.users.office')}</label>
            <select value={form.officeId} onChange={(e) => setForm({ ...form, officeId: e.target.value })}>
              <option value="">{t('admin.users.noOffice')}</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.nameEn} — {o.nameAr}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t('admin.users.roles')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {personas.map((p) => (
                <label key={p.code} className="mono" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.personaCodes.includes(p.code)} onChange={() => toggleRole(p.code)} />
                  {t(`persona.${p.code}`)}
                </label>
              ))}
            </div>
            <div className="hint">{t('admin.users.rolesHint')}</div>
          </div>
          <div className="action-row">
            <button type="submit" className="btn" disabled={busy || form.personaCodes.length === 0}>
              {busy ? <span className="spinner"></span> : null}{editingId ? t('admin.save') : t('admin.create')}
            </button>
            <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="muted"><span className="spinner"></span>{t('admin.loading')}</div>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>{t('admin.users.email')}</th>
              <th>{t('admin.users.fullNameEn')}</th>
              <th>{t('admin.users.office')}</th>
              <th>{t('admin.users.roles')}</th>
              <th>{t('admin.users.status')}</th>
              <th>{t('admin.users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className="empty">{t('admin.users.empty')}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td className="mono" style={{ fontSize: '0.82rem' }}>{u.email}</td>
                <td>{u.fullNameEn}</td>
                <td>{officeName(u.officeId)}</td>
                <td className="mono" style={{ fontSize: '0.78rem' }}>
                  {u.personas.map((p) => t(`persona.${p.code}`)).join(', ') || <span className="muted">—</span>}
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-COMPLETED' : 'badge-REJECTED'}`}>
                    {u.isActive ? t('admin.active') : t('admin.inactive')}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary small" onClick={() => openEdit(u)}>{t('admin.edit')}</button>{' '}
                  <button className="btn secondary small" onClick={() => resetPassword(u)}>{t('admin.users.resetPassword')}</button>{' '}
                  <button className={`btn small ${u.isActive ? 'warning' : ''}`} onClick={() => toggleActive(u)}>
                    {u.isActive ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
