import { supabase } from '../supabaseClient';
import { localiseRow } from './contentLocale';

/**
 * Evidence intelligence data access.
 *
 * The analyser runs as a Supabase edge function because reading a PDF and
 * asking a model about it needs a server-side key — the SPA is static and can
 * never hold one. Everything here either reads a view or calls an RPC that
 * enforces project access and editor rights in the database.
 */

/** How each evidence_state should be presented. `tone` maps to the CSS class. */
export const EVIDENCE_STATES = {
  no_evidence:      { key: 'evi.stateNoEvidence',      tone: 'muted',   attention: false },
  analysing:        { key: 'evi.stateAnalysing',       tone: 'busy',    attention: false },
  not_analysed:     { key: 'evi.stateNotAnalysed',     tone: 'info',    attention: false },
  not_relevant:     { key: 'evi.stateNotRelevant',     tone: 'muted',   attention: false },
  no_figure:        { key: 'evi.stateNoFigure',        tone: 'muted',   attention: false },
  already_reported: { key: 'evi.stateAlreadyReported', tone: 'ok',      attention: false },
  outdated:         { key: 'evi.stateOutdated',        tone: 'warn',    attention: true  },
  new_progress:     { key: 'evi.stateNewProgress',     tone: 'action',  attention: true  },
  conflicting:      { key: 'evi.stateConflicting',     tone: 'danger',  attention: true  },
  reviewed:         { key: 'evi.stateReviewed',        tone: 'ok',      attention: false },
  failed:           { key: 'evi.stateFailed',          tone: 'danger',  attention: true  },
};

export const stateMeta = (state) => EVIDENCE_STATES[state] ?? EVIDENCE_STATES.not_analysed;

/** Per-indicator rollup: has evidence, is it relevant, is the figure news. */
export async function fetchEvidenceStatus(projectId) {
  let query = supabase.from('v_indicator_evidence_status').select('*');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.indicator_id, {
    ...row,
    // Each document carries its own i18n, so the titles localise like any
    // other record text rather than staying in the entry language.
    recent_documents: (row.recent_documents ?? []).map((doc) => localiseRow(doc)),
  }]));
}

/** Every document filed against one indicator, with its latest finding. */
export async function fetchIndicatorEvidence(indicatorId) {
  const [docs, analyses] = await Promise.all([
    supabase.from('v_evidence').select('id, title, document_type, document_date, file_url, reporting_period, created_at')
      .eq('indicator_id', indicatorId).order('created_at', { ascending: false }),
    supabase.from('v_evidence_analysis').select('*')
      .eq('indicator_id', indicatorId).neq('review_state', 'superseded')
      .order('created_at', { ascending: false }),
  ]);
  if (docs.error) throw docs.error;
  if (analyses.error) throw analyses.error;
  const byEvidence = new Map((analyses.data ?? []).map((a) => [a.evidence_id, a]));
  return (docs.data ?? []).map((d) => ({ ...d, analysis: byEvidence.get(d.id) ?? null }));
}

/** Queue an analysis, then ask the edge function to run it now. */
export async function analyseEvidence(evidenceId) {
  const { data: analysisId, error } = await supabase.rpc('request_evidence_analysis', { p_evidence_id: evidenceId });
  if (error) throw error;

  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');

  const { data, error: fnError } = await supabase.functions.invoke('analyse-evidence', {
    body: { analysis_id: analysisId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (fnError) {
    // The queued row survives so the failure is visible in the UI rather than lost.
    throw new Error(fnError.message || 'The document could not be read.');
  }
  if (data?.error) throw new Error(data.error);
  return { analysisId, ...data };
}

export async function acceptAnalysis(analysisId, reportingPeriod = null) {
  const { data, error } = await supabase.rpc('apply_evidence_analysis', {
    p_analysis_id: analysisId, p_period: reportingPeriod,
  });
  if (error) throw error;
  return data;
}

export async function rejectAnalysis(analysisId, reason = null) {
  const { error } = await supabase.rpc('reject_evidence_analysis', {
    p_analysis_id: analysisId, p_reason: reason,
  });
  if (error) throw error;
}
