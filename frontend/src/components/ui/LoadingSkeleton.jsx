import i18n from '../../i18n';

// aria-label only; these render inside components that may not have a hook
// context of their own, so the instance is read directly.
const loadingLabel = () => i18n.t('ui.loading');

// LoadingSkeleton — skeleton placeholders instead of full-page spinners
// (spec §35). Widgets can load independently. Uses a token-driven shimmer.
//
//   <Skeleton width="60%" height={16} />
//   <SkeletonText lines={3} />
//   <SkeletonCard />   // a card-shaped placeholder
//   <SkeletonRows rows={5} cols={6} />  // table placeholder

const shimmer = {
  background: 'linear-gradient(90deg, var(--surface-1) 25%, var(--surface-2) 37%, var(--surface-1) 63%)',
  backgroundSize: '400% 100%',
  animation: 'merl-skeleton 1.3s ease-in-out infinite',
  borderRadius: 6,
};

// Keyframes injected once.
function Keyframes() {
  return <style>{`@keyframes merl-skeleton{0%{background-position:100% 0}100%{background-position:0 0}}`}</style>;
}

export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <span aria-hidden="true" style={{ display: 'block', width, height, ...shimmer, ...(radius != null ? { borderRadius: radius } : null), ...style }} />;
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <Keyframes />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 92 }) {
  return (
    <div className="card" role="status" aria-label={loadingLabel()} style={{ padding: '1rem 1.15rem' }}>
      <Keyframes />
      <Skeleton width="45%" height={12} style={{ marginBottom: '0.75rem' }} />
      <Skeleton width="70%" height={height >= 92 ? 26 : 18} />
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 5 }) {
  return (
    <div role="status" aria-label={loadingLabel()} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '0.5rem 0' }}>
      <Keyframes />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.75rem' }}>
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} width={c === 0 ? '80%' : '55%'} height={12} />)}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
