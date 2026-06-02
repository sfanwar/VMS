import { useEffect, useState, FormEvent, Fragment } from 'react';
import { adminApi, Office } from '../lib/api';
import { useTranslation } from '../lib/i18n';

const EMPTY_OFFICE = { nameEn: '', nameAr: '', authorizedPerson: '', telephoneNumber: '' };

export default function AdminOfficesPage() {
  const { t } = useTranslation();
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_OFFICE);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({ name: '', telephoneNumber: '' });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setOffices(await adminApi.offices.listAll());
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditingId(null); setForm(EMPTY_OFFICE); setShowForm(true); setMsg(null); }
  function openEdit(o: Office) {
    setEditingId(o.id);
    setForm({ nameEn: o.nameEn, nameAr: o.nameAr, authorizedPerson: o.authorizedPerson, telephoneNumber: o.telephoneNumber });
    setShowForm(true); setMsg(null);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (editingId) {
        await adminApi.offices.update(editingId, {
          nameEn: form.nameEn, nameAr: form.nameAr,
          authorizedPerson: form.authorizedPerson, telephoneNumber: form.telephoneNumber,
        });
        setMsg(t('admin.offices.officeUpdated'));
      } else {
        await adminApi.offices.create(form);
        setMsg(t('admin.offices.officeCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function toggleActive(o: Office & { isActive?: boolean }) {
    setErr(null);
    try { await adminApi.offices.update(o.id, { isActive: !(o.isActive ?? true) }); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function addContact(officeId: string) {
    if (!newContact.name.trim() || !newContact.telephoneNumber.trim()) return;
    setErr(null);
    try {
      await adminApi.offices.addContact(officeId, { name: newContact.name, telephoneNumber: newContact.telephoneNumber });
      setNewContact({ name: '', telephoneNumber: '' });
      await load();
    } catch (e: any) { setErr(e.message); }
  }

  async function makePrimary(officeId: string, contactId: string) {
    setErr(null);
    try { await adminApi.offices.updateContact(officeId, contactId, { isPrimary: true }); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function removeContact(officeId: string, contactId: string) {
    if (!window.confirm(t('admin.offices.confirmRemoveContact'))) return;
    setErr(null);
    try { await adminApi.offices.removeContact(officeId, contactId); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div className="card-title">{t('admin.offices.title')}</div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t('admin.offices.subtitle')}</div>
        </div>
        <button className="btn small" onClick={openCreate}>+ {t('admin.offices.newOffice')}</button>
      </div>

      {err && <div className="error-box">{err}</div>}
      {msg && <div className="success-box" style={{ marginBottom: 8 }}>{msg}</div>}

      {showForm && (
        <form onSubmit={submitForm} className="card" style={{ background: 'var(--surface-2, #fafafa)' }}>
          <div className="card-title">{editingId ? t('admin.offices.editTitle') : t('admin.offices.createTitle')}</div>
          <div className="field-row">
            <div className="field"><label>{t('admin.offices.nameEn')}</label>
              <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required /></div>
            <div className="field"><label>{t('admin.offices.nameAr')}</label>
              <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>{t('admin.offices.authorizedPerson')}</label>
              <input value={form.authorizedPerson} onChange={(e) => setForm({ ...form, authorizedPerson: e.target.value })} required /></div>
            <div className="field"><label>{t('admin.offices.telephone')}</label>
              <input value={form.telephoneNumber} onChange={(e) => setForm({ ...form, telephoneNumber: e.target.value })} required /></div>
          </div>
          <div className="action-row">
            <button type="submit" className="btn" disabled={busy}>
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
              <th>{t('admin.offices.nameEn')}</th>
              <th>{t('admin.offices.telephone')}</th>
              <th>{t('admin.offices.contacts')}</th>
              <th>{t('admin.offices.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offices.length === 0 ? (
              <tr><td colSpan={5} className="empty">{t('admin.offices.empty')}</td></tr>
            ) : offices.map((o) => {
              const active = (o as any).isActive ?? true;
              const isOpen = expandedId === o.id;
              return (
                <Fragment key={o.id}>
                  <tr>
                    <td>{o.nameEn}<div className="ar muted">{o.nameAr}</div></td>
                    <td className="mono" style={{ fontSize: '0.82rem' }}>{o.telephoneNumber}</td>
                    <td>
                      <button className="btn secondary small" onClick={() => setExpandedId(isOpen ? null : o.id)}>
                        {o.contacts?.length ?? 0} · {isOpen ? '▲' : '▼'}
                      </button>
                    </td>
                    <td>
                      <span className={`badge ${active ? 'badge-COMPLETED' : 'badge-REJECTED'}`}>
                        {active ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn secondary small" onClick={() => openEdit(o)}>{t('admin.edit')}</button>{' '}
                      <button className={`btn small ${active ? 'warning' : ''}`} onClick={() => toggleActive(o as any)}>
                        {active ? t('admin.deactivate') : t('admin.activate')}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface-2, #fafafa)' }}>
                        <strong style={{ fontSize: '0.85rem' }}>{t('admin.offices.contacts')}</strong>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                          {(o.contacts ?? []).map((c) => (
                            <li key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                              <span>{c.name}</span>
                              <span className="muted mono" style={{ fontSize: '0.78rem' }}>{c.telephoneNumber}</span>
                              {c.isPrimary
                                ? <span className="badge badge-SUBMITTED">{t('admin.primary')}</span>
                                : <button className="btn secondary small" onClick={() => makePrimary(o.id, c.id)}>{t('admin.makePrimary')}</button>}
                              <button className="btn small warning" onClick={() => removeContact(o.id, c.id)}>{t('admin.remove')}</button>
                            </li>
                          ))}
                        </ul>
                        <div className="field-row" style={{ alignItems: 'flex-end' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label>{t('admin.offices.contactName')}</label>
                            <input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>{t('admin.offices.telephone')}</label>
                            <input value={newContact.telephoneNumber} onChange={(e) => setNewContact({ ...newContact, telephoneNumber: e.target.value })} />
                          </div>
                          <button className="btn secondary small" onClick={() => addContact(o.id)}>+ {t('admin.offices.addContact')}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
