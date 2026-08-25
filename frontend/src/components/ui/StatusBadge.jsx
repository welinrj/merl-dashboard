// StatusBadge — one semantic status pill used everywhere (spec §4, §69).
// Status is conveyed by BOTH colour and text (accessibility), with a dot.
//
//   <StatusBadge status="on_track" />        // known status -> tone + label
//   <StatusBadge tone="warning" label="At Risk" />
//
// Semantic tones (spec §4):
//   success (green)  On Track / Completed / Approved / Verified
//   warning (amber)  Attention / At Risk / Pending
//   danger  (red)    Delayed / Off Track / High risk / Rejected
//   neutral (grey)   No Data / Closed / Inactive
//   info    (teal)   In progress / Submitted / Under review

import { useTranslation } from 'react-i18next';

const TONES = {
  success: { col: 'var(--green-600)', bg: 'var(--green-50)',  txt: 'var(--green-800)' },
  warning: { col: 'var(--gold-500)',  bg: 'var(--gold-100)',  txt: '#8a6416' },
  danger:  { col: 'var(--red-600)',   bg: 'var(--red-100)',   txt: 'var(--red-700)' },
  neutral: { col: 'var(--text-3)',    bg: 'var(--surface-1)', txt: 'var(--text-2)' },
  info:    { col: '#2563eb',          bg: '#e6effe',          txt: '#1e40af' },
};

// Map known status codes/labels to a tone + display label.
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
  const pad = size === 'md' ? '0.2rem 0.6rem' : '0.15rem 0.5rem';
  const fs = size === 'md' ? '0.75rem' : '0.6875rem';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: m.bg, color: m.txt,
      borderRadius: 9999, padding: pad, fontSize: fs, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: m.col }} />
      {l}
    </span>
  );
}
