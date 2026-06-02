import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestsApi, referenceApi, Office } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

interface Beneficiary {
  fullNameEn: string;
  fullNameAr?: string;
  passportNumber?: string;
  nationality?: string;
}

export default function RequestCreatePage() {
  const nav = useNavigate();
  const { user, hasPersona } = useAuth();
  const { t } = useTranslation();

  // Only OFFICE and SENIOR_ADMIN can create requests (BRD §5.2)
  const canCreate = user?.personas.some((p) => p.code === 'OFFICE' || p.code === 'SENIOR_ADMIN') ?? false;
  if (user && !canCreate) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
        <div className="card-title">{t('create.notAuthorizedTitle')}</div>
        <p className="muted">{t('create.notAuthorizedBody')}</p>
        <button className="btn secondary" onClick={() => nav('/requests')}>← {t('create.backToList')}</button>
      </div>
    );
  }

  const [countries, setCountries] = useState<Array<{ id: string; nameEn: string; nameAr: string }>>([]);
  const [visaTypes, setVisaTypes] = useState<Array<{ id: string; nameEn: string; nameAr: string }>>([]);
  const [offices, setOffices] = useState<Office[]>([]);

  const [officeId, setOfficeId] = useState<string>('');
  const [officeContactId, setOfficeContactId] = useState<string>('');
  const [countryId, setCountryId] = useState<string>('');
  const [visaTypeId, setVisaTypeId] = useState<string>('');
  const [numberOfPassengers, setNumberOfPassengers] = useState<number>(1);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ fullNameEn: '' }]);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canChooseOffice = hasPersona('SENIOR_ADMIN');

  useEffect(() => {
    (async () => {
      try {
        // Always load offices now — both admins (who pick one) and office users
        // (whose own office is pre-selected) need the office details so the
        // authorized-person and telephone fields can auto-populate.
        const [c, v, o] = await Promise.all([
          referenceApi.countries(),
          referenceApi.visaTypes(),
          referenceApi.offices().catch(() => []),
        ]);
        setCountries(c);
        setVisaTypes(v);
        setOffices(o);

        // Office users: pre-select their own office so its details populate.
        if (!canChooseOffice && user?.officeId) {
          setOfficeId(user.officeId);
        }
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, [canChooseOffice, user?.officeId]);

  // Keep beneficiaries array in sync with numberOfPassengers
  useEffect(() => {
    setBeneficiaries((prev) => {
      const n = Math.max(1, Math.min(50, numberOfPassengers || 1));
      if (prev.length === n) return prev;
      if (prev.length > n) return prev.slice(0, n);
      return [...prev, ...Array(n - prev.length).fill(0).map(() => ({ fullNameEn: '' }))];
    });
  }, [numberOfPassengers]);

  const selectedOffice = offices.find((o) => o.id === officeId);
  const officeContacts = selectedOffice?.contacts ?? [];
  const selectedContact = officeContacts.find((c) => c.id === officeContactId);

  // When the office changes (or offices load), default to its primary authorized
  // person. Offices arrive pre-sorted primary-first, so contacts[0] is the primary.
  useEffect(() => {
    const contacts = offices.find((o) => o.id === officeId)?.contacts ?? [];
    setOfficeContactId(contacts[0]?.id ?? '');
  }, [officeId, offices]);

  // Office users are locked to their own office; only FAD admins may choose.
  const selectableOffices = canChooseOffice
    ? offices
    : offices.filter((o) => o.id === user?.officeId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (beneficiaries.some((b) => !b.fullNameEn.trim())) {
      setErr(t('create.validation.beneficiaryNameRequired'));
      return;
    }
    setBusy(true);
    try {
      const created = await requestsApi.create({
        ...(officeId ? { officeId } : {}),
        ...(officeContactId ? { officeContactId } : {}),
        countryOfVisitId: countryId,
        visaTypeId,
        numberOfPassengers,
        beneficiaries,
      });
      nav(`/requests/${created.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('list.newRequestButton')}</div>
          <h1>{t('create.pageTitle')}</h1>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="card">
          <div className="card-title">{t('detail.fields')}</div>

          {err && <div className="error-box">{err}</div>}

          <div className="field-row">
            <div className="field">
              <label>{t('create.office')}</label>
              {/* Office users are locked to their own office (disabled, pre-selected
                  and linked to them on submit). Only FAD admins pick from the list.
                  The backend independently forces an office user to their own office. */}
              <select
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                required
                disabled={!canChooseOffice}
              >
                <option value="" disabled>{t('create.selectOffice')}</option>
                {selectableOffices.map((o) => (
                  <option key={o.id} value={o.id}>{o.nameEn} — {o.nameAr}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('create.authorizedPerson')}</label>
              {/* An office may have several authorized persons (BRD §5.2). Pick
                  one; the primary contact is pre-selected. Telephone follows the
                  chosen contact. Disabled when the office has no contacts. */}
              <select
                value={officeContactId}
                onChange={(e) => setOfficeContactId(e.target.value)}
                disabled={!selectedOffice || officeContacts.length === 0}
              >
                {officeContacts.length === 0 && (
                  <option value="">{selectedOffice?.authorizedPerson ?? '—'}</option>
                )}
                {officeContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isPrimary ? ` — ${t('create.primaryContact')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>{t('create.telephoneNumber')}</label>
              {/* Auto-populated from the selected authorized person; read-only */}
              <input
                value={selectedContact?.telephoneNumber ?? selectedOffice?.telephoneNumber ?? ''}
                placeholder="—"
                disabled
              />
            </div>

            <div className="field">
              <label>{t('create.requestDate')}</label>
              <input value={new Date().toLocaleDateString('en-CA')} disabled />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>{t('create.countryOfVisit')}</label>
              <select value={countryId} onChange={(e) => setCountryId(e.target.value)} required>
                <option value="" disabled>{t('create.selectCountry')}</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameEn} — {c.nameAr}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('create.visaType')}</label>
              <select value={visaTypeId} onChange={(e) => setVisaTypeId(e.target.value)} required>
                <option value="" disabled>{t('create.selectVisaType')}</option>
                {visaTypes.map((v) => (
                  <option key={v.id} value={v.id}>{v.nameEn} — {v.nameAr}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ maxWidth: 240 }}>
            <label>{t('create.numberOfPassengers')}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={numberOfPassengers}
              onChange={(e) => setNumberOfPassengers(parseInt(e.target.value, 10) || 1)}
              required
            />
            <div className="hint">{t('create.validation.beneficiariesMatchCount')}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t('create.beneficiariesSection')}</div>
          {beneficiaries.map((b, i) => (
            <div key={i} className="beneficiary">
              <span className="seq">#{i + 1}</span>
              <input
                placeholder={t('create.beneficiaryName')}
                value={b.fullNameEn}
                onChange={(e) => {
                  const next = [...beneficiaries];
                  next[i] = { ...next[i], fullNameEn: e.target.value };
                  setBeneficiaries(next);
                }}
                required
              />
              <input
                placeholder={t('create.passportNumber')}
                value={b.passportNumber ?? ''}
                onChange={(e) => {
                  const next = [...beneficiaries];
                  next[i] = { ...next[i], passportNumber: e.target.value || undefined };
                  setBeneficiaries(next);
                }}
              />
              <span className="mono muted" style={{ fontSize: '0.78rem' }}>
                {b.fullNameEn ? '✓' : '—'}
              </span>
            </div>
          ))}
        </div>

        <div className="action-row">
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner"></span>}
            {busy ? t('create.saving') : t('create.saveDraftButton')}
          </button>
          <button type="button" className="btn secondary" onClick={() => nav('/requests')}>
            {t('detail.cancel')}
          </button>
        </div>
      </form>
    </>
  );
}
