import { useEffect, useState } from 'react';
import { adminApi, Country, VisaTypeRef } from '../lib/api';
import { useTranslation } from '../lib/i18n';

export default function AdminReferencePage() {
  const { t } = useTranslation();
  const [countries, setCountries] = useState<Country[]>([]);
  const [visaTypes, setVisaTypes] = useState<VisaTypeRef[]>([]);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [country, setCountry] = useState({ isoCode: '', nameEn: '', nameAr: '' });
  const [visaType, setVisaType] = useState({ code: '', nameEn: '', nameAr: '' });

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [c, v] = await Promise.all([
        adminApi.reference.countries(includeInactive),
        adminApi.reference.visaTypes(includeInactive),
      ]);
      setCountries(c);
      setVisaTypes(v);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [includeInactive]);

  async function addCountry() {
    if (!country.isoCode.trim() || !country.nameEn.trim() || !country.nameAr.trim()) return;
    setErr(null);
    try { await adminApi.reference.createCountry(country); setCountry({ isoCode: '', nameEn: '', nameAr: '' }); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function toggleCountry(c: Country) {
    setErr(null);
    try { await adminApi.reference.updateCountry(c.id, { isActive: !c.isActive }); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function addVisaType() {
    if (!visaType.code.trim() || !visaType.nameEn.trim() || !visaType.nameAr.trim()) return;
    setErr(null);
    try { await adminApi.reference.createVisaType(visaType); setVisaType({ code: '', nameEn: '', nameAr: '' }); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function toggleVisaType(v: VisaTypeRef) {
    setErr(null);
    try { await adminApi.reference.updateVisaType(v.id, { isActive: !v.isActive }); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p className="muted" style={{ margin: 0 }}>{t('admin.reference.subtitle')}</p>
        <label className="mono" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          {t('admin.reference.showInactive')}
        </label>
      </div>
      {err && <div className="error-box">{err}</div>}

      <div className="card">
        <div className="card-title">{t('admin.reference.countries')}</div>
        <div className="field-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, maxWidth: 120 }}><label>{t('admin.reference.isoCode')}</label>
            <input value={country.isoCode} maxLength={2} onChange={(e) => setCountry({ ...country, isoCode: e.target.value.toUpperCase() })} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('admin.reference.nameEn')}</label>
            <input value={country.nameEn} onChange={(e) => setCountry({ ...country, nameEn: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('admin.reference.nameAr')}</label>
            <input value={country.nameAr} onChange={(e) => setCountry({ ...country, nameAr: e.target.value })} /></div>
          <button className="btn secondary small" onClick={addCountry}>+ {t('admin.reference.addCountry')}</button>
        </div>
        {loading ? <div className="muted"><span className="spinner"></span>{t('admin.loading')}</div> : (
          <table className="list" style={{ marginTop: 12 }}>
            <thead><tr><th>{t('admin.reference.isoCode')}</th><th>{t('admin.reference.nameEn')}</th><th>{t('admin.reference.nameAr')}</th><th>{t('admin.reference.status')}</th><th></th></tr></thead>
            <tbody>
              {countries.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.isoCode}</td>
                  <td>{c.nameEn}</td>
                  <td className="ar">{c.nameAr}</td>
                  <td><span className={`badge ${c.isActive ? 'badge-COMPLETED' : 'badge-REJECTED'}`}>{c.isActive ? t('admin.active') : t('admin.inactive')}</span></td>
                  <td><button className={`btn small ${c.isActive ? 'warning' : ''}`} onClick={() => toggleCountry(c)}>{c.isActive ? t('admin.deactivate') : t('admin.activate')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">{t('admin.reference.visaTypes')}</div>
        <div className="field-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, maxWidth: 160 }}><label>{t('admin.reference.code')}</label>
            <input value={visaType.code} onChange={(e) => setVisaType({ ...visaType, code: e.target.value.toUpperCase() })} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('admin.reference.nameEn')}</label>
            <input value={visaType.nameEn} onChange={(e) => setVisaType({ ...visaType, nameEn: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>{t('admin.reference.nameAr')}</label>
            <input value={visaType.nameAr} onChange={(e) => setVisaType({ ...visaType, nameAr: e.target.value })} /></div>
          <button className="btn secondary small" onClick={addVisaType}>+ {t('admin.reference.addVisaType')}</button>
        </div>
        {loading ? null : (
          <table className="list" style={{ marginTop: 12 }}>
            <thead><tr><th>{t('admin.reference.code')}</th><th>{t('admin.reference.nameEn')}</th><th>{t('admin.reference.nameAr')}</th><th>{t('admin.reference.status')}</th><th></th></tr></thead>
            <tbody>
              {visaTypes.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{v.code}</td>
                  <td>{v.nameEn}</td>
                  <td className="ar">{v.nameAr}</td>
                  <td><span className={`badge ${v.isActive ? 'badge-COMPLETED' : 'badge-REJECTED'}`}>{v.isActive ? t('admin.active') : t('admin.inactive')}</span></td>
                  <td><button className={`btn small ${v.isActive ? 'warning' : ''}`} onClick={() => toggleVisaType(v)}>{v.isActive ? t('admin.deactivate') : t('admin.activate')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
