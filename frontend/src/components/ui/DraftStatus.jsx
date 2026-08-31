// DraftStatus.jsx — the one line that tells an officer their unfinished form is
// safe: what was kept, when, and how to throw it away.
//
// Pair it with `useFormDraft` (lib/formDraft.js):
//   const draft = useFormDraft(key, v, { baseline: seed, onRestore: setV });
//   <DraftStatus draft={draft} />
//
// It renders nothing while a form is untouched, so a clean form stays clean.
import { useTranslation } from 'react-i18next';
import { RotateCcw, CheckCircle2 } from './icons';
import { fmtTime } from '../../lib/locale';
import { confirmDialog } from '../../lib/confirm';

export default function DraftStatus({ draft, style, className }) {
  const { t } = useTranslation();
  if (!draft) return null;
  const { status, savedAt, restoredAt, discard } = draft;
  if (status === 'idle' && savedAt == null) return null;

  const restored = status === 'restored' && restoredAt != null;
  const label = status === 'saving' ? t('draft.saving')
    : restored ? t('draft.restored', { time: fmtTime(restoredAt) })
      : t('draft.savedAt', { time: fmtTime(savedAt) });

  const onDiscard = async () => {
    const ok = await confirmDialog({
      title: t('draft.discardTitle'),
      message: t('draft.discardMessage'),
      confirmLabel: t('draft.discardConfirm'),
      cancelLabel: t('draft.keep'),
    });
    if (ok) discard();
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
        fontSize: '0.72rem', color: 'var(--text-3)', ...style,
      }}
    >
      <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        {status === 'saving'
          ? <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-500)', flexShrink: 0 }} />
          : <CheckCircle2 size={13} aria-hidden="true" style={{ color: restored ? 'var(--green-700)' : 'var(--text-3)', flexShrink: 0 }} />}
        {label}
      </span>
      {savedAt != null && status !== 'saving' && (
        <button
          type="button"
          onClick={onDiscard}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            background: 'none', border: 'none', padding: '0.35rem 0.25rem', minHeight: 32,
            font: 'inherit', color: 'var(--green-700)', cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          <RotateCcw size={12} aria-hidden="true" /> {t('draft.discard')}
        </button>
      )}
    </div>
  );
}

/** Small "Draft" marker for a tab or step that has unfinished work waiting. */
export function DraftChip({ style }) {
  const { t } = useTranslation();
  return (
    <span
      title={t('draft.chipTitle')}
      style={{
        display: 'inline-flex', alignItems: 'center', fontSize: '0.62rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.6,
        color: '#8a6416', background: '#fdf3dc', border: '1px solid #d9a62933',
        borderRadius: 9999, padding: '0 0.35rem', ...style,
      }}
    >
      {t('draft.chip')}
    </span>
  );
}
