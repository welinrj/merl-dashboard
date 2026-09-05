// Draft status is deliberately quiet: it confirms that unfinished work is safe
// without turning draft state into a decorative badge system.
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
          ? <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold-500)', flexShrink: 0 }} />
          : <CheckCircle2 size={13} aria-hidden="true" style={{ color: restored ? '#317347' : 'var(--text-3)', flexShrink: 0 }} />}
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

/** Small marker for a section that has unfinished work waiting. */
export function DraftChip({ style }) {
  const { t } = useTranslation();
  return (
    <span
      title={t('draft.chipTitle')}
      style={{
        display: 'inline-flex', alignItems: 'center', fontSize: '0.68rem', fontWeight: 650,
        textTransform: 'none', letterSpacing: 0, lineHeight: 1.5,
        color: '#806019', background: '#fbf6e8', border: '1px solid #e8d8a8',
        borderRadius: 4, padding: '0.05rem 0.35rem', ...style,
      }}
    >
      {t('draft.chip')}
    </span>
  );
}
