import { PERFORMANCE_THRESHOLDS } from './reporting';
// Target achievement grading is separate from the recorded schedule judgement.
export function resultKpiGrade(entry) {
  const pct = entry?.pct != null && Number.isFinite(Number(entry.pct)) ? Number(entry.pct) : null;
  if (pct != null) {
    if (pct >= 100) return { tone: 'achieved', label: 'achieved', pct };
    if (pct >= PERFORMANCE_THRESHOLDS.onTrack) return { tone: 'on-track', label: 'high', pct };
    if (pct >= PERFORMANCE_THRESHOLDS.attention) return { tone: 'attention', label: 'middle', pct };
    return { tone: 'low', label: 'low', pct };
  }
  if (entry?.status === 'achieved') return { tone: 'achieved', label: 'achieved', pct: null };
  if (entry?.status === 'on_track') return { tone: 'on-track', label: 'onTrack', pct: null };
  if (entry?.status === 'below_target') return { tone: 'attention', label: 'attention', pct: null };
  return { tone: 'neutral', label: entry?.status === 'not_yet_due' ? 'notDue' : entry?.progress ? 'notAssessed' : 'unreported', pct: null };
}
