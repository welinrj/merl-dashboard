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

const TONES = {
  success: { col: 'var(--green-600)', bg: 'var(--green-50)',  txt: 'var(--green-800)' },
  warning: { col: 'var(--gold-500)',  bg: 'var(--gold-100)',  txt: '#8a6416' },
  danger:  { col: 'var(--red-600)',   bg: 'var(--red-100)',   txt: 'var(--red-700)' },
  neutral: { col: 'var(--text-3)',    bg: 'var(--surface-1)', txt: 'var(--text-2)' },
  info:    { col: '#2563eb',          bg: '#e6effe',          txt: '#1e40af' },
};

// Map known status codes/labels to a tone + display label.
const STATUS_MAP = {
  on_track:   ['success', 'On Track'],   green:     ['success', 'On Track'],
  completed:  ['success', 'Completed'],  approved:  ['success', 'Approved'],
  verified:   ['success', 'Verified'],   active:    ['success', 'Active'],
  at_risk:    ['warning', 'At Risk'],    amber:     ['warning', 'At Risk'],
  pending:    ['warning', 'Pending'],    attention: ['warning', 'Attention'],
  returned:   ['warning', 'Returned'],
  no_progress:['danger',  'No Progress'],red:       ['danger',  'Off Track'],
  delayed:    ['danger',  'Delayed'],    off_track: ['danger',  'Off Track'],
  rejected:   ['danger',  'Rejected'],   high:      ['danger',  'High'],
  critical:   ['danger',  'Critical'],   overdue:   ['danger',  'Overdue'],
  draft:      ['neutral', 'Draft'],      inactive:  ['neutral', 'Inactive'],
  closed:     ['neutral', 'Closed'],     none:      ['neutral', 'No Data'],
  unrated:    ['neutral', 'Unrated'],
  submitted:  ['info',    'Submitted'],  reviewed:  ['info',    'Under Review'],
  in_progress:['info',    'In Progress'],
};

export default function StatusBadge({ status, tone, label, size = 'sm' }) {
  let t = tone, l = label;
  if (status && (!t || !l)) {
    const key = String(status).toLowerCase();
    const hit = STATUS_MAP[key];
    if (hit) { t = t || hit[0]; l = l || hit[1]; }
    else { t = t || 'neutral'; l = l || String(status); }
  }
  const m = TONES[t] || TONES.neutral;
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
