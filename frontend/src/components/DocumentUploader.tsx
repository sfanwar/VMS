import { useState, useRef, ChangeEvent } from 'react';
import { documentsApi } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface DocKindSpec {
  kind: string;
  /** How many files of this kind a request needs */
  expectedCount: 'one' | 'one_per_beneficiary';
  /** Accept attribute for the file input */
  accept: string;
}

const DOC_SPECS: DocKindSpec[] = [
  { kind: 'OFFICE_LETTER',          expectedCount: 'one',                accept: '.pdf,application/pdf' },
  { kind: 'BENEFICIARY_ATTACHMENT', expectedCount: 'one_per_beneficiary', accept: '.pdf,application/pdf' },
  { kind: 'EMBASSY_VISA_FORM',      expectedCount: 'one_per_beneficiary', accept: '.pdf,application/pdf' },
  { kind: 'SUPPORTING_DOCUMENT',    expectedCount: 'one',                accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png' },
  { kind: 'EMBASSY_LETTER',         expectedCount: 'one',                accept: '.pdf,application/pdf' },
  { kind: 'VISA_APPLICATION',       expectedCount: 'one_per_beneficiary', accept: '.pdf,application/pdf' },
  { kind: 'VISA',                   expectedCount: 'one_per_beneficiary', accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png' },
];

// Which document kinds may be UPLOADED at each workflow status.
// A new request (DRAFT) — and a returned one — only takes the four office
// documents. Later stages introduce their own documents. Stages not listed
// here (under review, terminal) allow no uploads.
const OFFICE_DOCS = ['OFFICE_LETTER', 'BENEFICIARY_ATTACHMENT', 'EMBASSY_VISA_FORM', 'SUPPORTING_DOCUMENT'];
const UPLOADABLE_BY_STATUS: Record<string, string[]> = {
  DRAFT:                OFFICE_DOCS,
  RETURNED_TO_OFFICE:   OFFICE_DOCS,
  FINAL_VERIFICATION:   ['EMBASSY_LETTER'],
  TYPIST_PROCESSING:    ['VISA_APPLICATION'],
  WAITING_FOR_EMBASSY:  ['VISA'],
  AT_EMBASSY:           ['VISA'],
  // SUBMITTED, INITIAL_VERIFICATION, DIRECTOR_REVIEW, WAITING_FINAL_REVIEW,
  // COMPLETED, APOLOGIZED, REJECTED → no uploads (omitted = empty)
};

interface Props {
  requestId: string;
  /** Current request status — controls which document kinds may be uploaded */
  status: string;
  beneficiaryCount: number;
  uploadedDocs: Array<{ id: string; kind: string; originalName: string }>;
  onUploaded: () => void;
}

export default function DocumentUploader({ requestId, status, beneficiaryCount, uploadedDocs, onUploaded }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Only the document kinds permitted at the current status are shown.
  const allowedKinds = UPLOADABLE_BY_STATUS[status] ?? [];
  const visibleSpecs = DOC_SPECS.filter((s) => allowedKinds.includes(s.kind));

  function countForKind(kind: string): number {
    return uploadedDocs.filter((d) => d.kind === kind).length;
  }

  function neededFor(spec: DocKindSpec): number {
    return spec.expectedCount === 'one' ? 1 : beneficiaryCount;
  }

  function statusFor(spec: DocKindSpec): 'complete' | 'partial' | 'empty' {
    const have = countForKind(spec.kind);
    const need = neededFor(spec);
    if (have >= need) return 'complete';
    if (have > 0) return 'partial';
    return 'empty';
  }

  async function handleFileChosen(spec: DocKindSpec, e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErr(null);
    setUploadingKind(spec.kind);
    try {
      for (const file of Array.from(files)) {
        await documentsApi.upload(file, requestId, spec.kind);
      }
      onUploaded();
    } catch (e: any) {
      const kindLabel = t(`uploader.documentKinds.${spec.kind}`);
      // Map a backend errorCode to a translated message; otherwise show the message
      const code = e?.errorCode;
      const localised = code && t(`errors.${code}`) !== `errors.${code}` ? t(`errors.${code}`) : (e?.message ?? t('uploader.failed'));
      setErr(`${kindLabel}: ${localised}`);
    } finally {
      setUploadingKind(null);
      if (fileInputs.current[spec.kind]) {
        fileInputs.current[spec.kind]!.value = '';
      }
    }
  }

  // Nothing is uploadable at this status (e.g. under review, or terminal) —
  // render nothing. The list of already-uploaded documents is shown separately
  // by the parent, so reviewers can still see what was attached.
  if (visibleSpecs.length === 0) {
    return null;
  }

  if (!open) {
    return (
      <button className="btn secondary small" onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
        + {t('uploader.uploadButton')}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      {err && <div className="error-box">{err}</div>}

      <div className="uploader-grid">
        {visibleSpecs.map((spec) => {
          const docStatus = statusFor(spec);
          const have = countForKind(spec.kind);
          const need = neededFor(spec);
          const isUploading = uploadingKind === spec.kind;

          return (
            <div key={spec.kind} className={`uploader-row uploader-${docStatus}`}>
              <div className="uploader-label">
                <div className="uploader-name">
                  {t(`uploader.documentKinds.${spec.kind}`)}
                </div>
              </div>

              <div className="uploader-progress mono">
                {t('uploader.requiredCount', { have, required: need })}
                {docStatus === 'complete' && <span className="check"> ✓</span>}
              </div>

              <div className="uploader-action">
                <input
                  type="file"
                  multiple={spec.expectedCount === 'one_per_beneficiary'}
                  accept={spec.accept}
                  ref={(el) => { fileInputs.current[spec.kind] = el; }}
                  onChange={(e) => handleFileChosen(spec, e)}
                  disabled={isUploading}
                  style={{ display: 'none' }}
                  id={`upload-${spec.kind}`}
                />
                <label
                  htmlFor={`upload-${spec.kind}`}
                  className="btn secondary small"
                  style={{ cursor: 'pointer', display: 'inline-block' }}
                >
                  {isUploading
                    ? <><span className="spinner"></span>{t('uploader.uploading')}</>
                    : t('uploader.selectFile')}
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn secondary small" onClick={() => setOpen(false)} style={{ marginTop: 12 }}>
        {t('common.close')}
      </button>
    </div>
  );
}
