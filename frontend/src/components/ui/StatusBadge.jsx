// Semantic status label used throughout the MERL portal. Status is conveyed by
// text plus a small colour marker. The compact rectangular treatment reads like
// application metadata rather than a decorative dashboard pill.
import { useTranslation } from 'react-i18next';

import { CheckCircle2, AlertTriangle, Info, RotateCcw } from './icons';

const TONES = new Set(['success','warning','danger','neutral','info']);

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
  closed:     ['success', 'status.closed'],      none:      ['neutral', 'status.no_data'],
  unrated:    ['neutral', 'status.unrated'],
  no_data:    ['neutral', 'status.no_data'],
  unreported: ['neutral', 'status.no_data'],
  not_reported: ['neutral', 'status.no_data'],
  pending_review: ['warning', 'status.pending'],
  submitted:  ['warning',    'status.submitted'],   reviewed:  ['warning',    'status.under_review'],
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
  const semanticTone = TONES.has(resolvedTone) ? resolvedTone : 'neutral';
  const Icon = status === 'returned' ? RotateCcw : semanticTone === 'success' ? CheckCircle2
    : semanticTone === 'danger' || ['at_risk','amber','attention','overdue'].includes(status) ? AlertTriangle : Info;
  return (
    <span className="merl-status-badge" data-tone={semanticTone} data-size={size}>
      <Icon size={14} aria-hidden="true" /><span>{l}</span>
    </span>
  );
}
