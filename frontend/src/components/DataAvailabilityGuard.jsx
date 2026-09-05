import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Blocks portal values after a failed Supabase read so a transport/permission
 * failure can never be mistaken for a legitimate zero. The Supabase client
 * emits `merl:supabase-read-error` for failed REST GET/HEAD requests.
 */
export default function DataAvailabilityGuard() {
  const { t } = useTranslation();
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    const onFailure = (event) => setFailure(event.detail || { status: 0 });
    window.addEventListener('merl:supabase-read-error', onFailure);
    return () => window.removeEventListener('merl:supabase-read-error', onFailure);
  }, []);

  if (!failure) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="data-availability-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'grid', placeItems: 'center', padding: '1rem',
        background: 'rgba(22, 18, 28, 0.52)', backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        width: 'min(440px, 100%)', background: 'var(--white)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
        boxShadow: '0 18px 50px rgba(20, 15, 28, 0.22)', padding: '1.25rem',
      }}>
        <h2 id="data-availability-title" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-1)' }}>
          {t('ppa.sectionFailed')}
        </h2>
        <p style={{ margin: '0.55rem 0 1rem', fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--text-2)' }}>
          {t('dash.dataUnavailable', { defaultValue: 'Data could not be retrieved. Dashboard values are hidden to prevent a failed request being shown as zero.' })}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
          style={{ width: '100%' }}
        >
          {t('ppa.retry')}
        </button>
      </div>
    </div>
  );
}
