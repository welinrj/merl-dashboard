// Semantic status label used throughout the MERL portal. Status is conveyed by
// text plus a small colour marker. The compact rectangular treatment reads like
// application metadata rather than a decorative dashboard pill.
import { useTranslation } from 'react-i18next';

const TONES = {
  success: { col: '#1a8c4e', bg: '#f1f7f3', txt: '#2f6f45' },
  warning: { col: '#c28a20', bg: '#fbf6e8', txt: '#806019' },
  danger:  { col: '#b3402f', bg: '#fbf1ef', txt: '#8c3529' },
  neutral: { col: '#85808d', bg: '#f5f5f7', txt: '#625d69' },
  info:    { col: '#4d73a5', bg: '#f0f4f9', txt: '#3f6088' },
};

const STATUS_MAP = {
  on_track:   ['success', 'status.on_track'],    green:     ['success', 'status.on_track'],
  completed:  ['success', 'status.completed'],   approved:  ['success', 'status.approved'],
  verified:   ['success', 'status.verified'],    active:    ['success', 'status.active'],
  at_risk:    ['warning', 'status.at_risk'],     amber:     ['warning', 'status.at_risk'],
  pending:    ['warning', 'status.pending'],     attention: ['warning', 'status.attention'],
  returned:   ['warning', 'status.returned'],
  no_progress:['danger',  'status.no_progress'], red:       ['danger',  'status.off_track'],
  delayed:    ['danger',  'status.delayed'],     off_track: ['danger',  'status.off_track'],
  rejected:   ['danger',  'status.rejected'],    high:      ['danger',  'status.high'],
  critical:   ['danger',  'status.critical'],    overdue:   ['danger',  'status.overdue'],
  draft:      ['neutral', 'status.draft'],       inactive:  ['neutral', 'status.inactive'],
  closed:     ['neutral', 'status.closed'],      none:      ['neutral', 'status.no_data'],
  unrated:    ['neutral', 'status.unrated'],
  submitted:  ['info',    'status.submitted'],   reviewed:  ['info',    'status.under_review'],
  in_progress:['info',    'status.in_progress'],
};

export default function StatusBadge({ status, tone, label, size = 'sm' }) {
  const { t } = useTranslation();
  let resolvedTone = tone, l = label;
  if (status && (!resolvedTone || !l)) {
    const key = String(status).toLowerCase();
    const hit = STATUS_MAP[key];
    if (hit) { resolvedTone = resolvedTone || hit[0]; l = l || t(hit[1]); }
    else { resolvedTone = resolvedTone || 'neutral'; l = l || String(status); }
  }
  const m = TONES[resolvedTone] || TONES.neutral;
  const pad = size === 'md' ? '0.24rem 0.52rem' : '0.18rem 0.44rem';
  const fs = size === 'md' ? '0.75rem' : '0.7rem';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: m.bg, color: m.txt,
      border: `1px solid ${m.col}26`, borderRadius: 4, padding: pad, fontSize: fs,
      fontWeight: 650, letterSpacing: 0, textTransform: 'none', whiteSpace: 'nowrap',
    }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: m.col }} />
      {l}
    </span>
  );
}
