import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  fetchIndicatorEvidence, analyseEvidence, acceptAnalysis, rejectAnalysis, stateMeta,
} from '../lib/evidenceIntelligence';
import { openIndicatorEvidence } from '../lib/indicatorEvidenceFiles';
import { fmtDate, fmtNum } from '../lib/locale';

/** Map a single analysis row onto the badge vocabulary used across the portal. */
function analysisState(analysis) {
  if (!analysis) return 'not_analysed';
  if (analysis.status === 'failed') return 'failed';
  if (analysis.status !== 'complete') return 'analysing';
  if (analysis.relevance === 'not_relevant') return 'not_relevant';
  if (analysis.review_state === 'accepted' || analysis.review_state === 'rejected') return 'reviewed';
  return analysis.reconciliation ?? 'not_analysed';
}

export function EvidenceBadge({ state, count }) {
  const { t } = useTranslation();
  const meta = stateMeta(state);
  return (
    <span className={`evi-badge evi-${meta.tone}`}>
      {t(meta.key)}
      {count > 1 ? <em className="evi-badge-count">{count}</em> : null}
    </span>
  );
}

export default function IndicatorEvidencePanel({ indicator, canEdit, onProgressWritten }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!indicator?.id) return;
    setLoading(true);
    try {
      setRows(await fetchIndicatorEvidence(indicator.id));
    } catch (error) {
      toast.error(error?.message || t('evi.readFailed'));
    } finally {
      setLoading(false);
    }
  }, [indicator?.id, t]);

  useEffect(() => { load(); }, [load, i18n.language]);

  const run = async (evidenceId) => {
    setBusyId(evidenceId);
    const pending = toast.loading(t('evi.analysing'));
    try {
      await analyseEvidence(evidenceId);
      await load();
      toast.success(t('evi.heading'), { id: pending });
    } catch (error) {
      toast.error(error?.message || t('evi.readFailed'), { id: pending });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (analysis) => {
    setBusyId(analysis.evidence_id);
    try {
      await acceptAnalysis(analysis.id);
      toast.success(t('evi.appliedAs'));
      await load();
      onProgressWritten?.();
    } catch (error) {
      toast.error(error?.message || t('evi.readFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (analysis) => {
    const reason = window.prompt(t('evi.rejectReason'));
    if (reason === null) return;
    setBusyId(analysis.evidence_id);
    try {
      await rejectAnalysis(analysis.id, reason || null);
      toast.success(t('evi.dismissed'));
      await load();
    } catch (error) {
      toast.error(error?.message || t('evi.readFailed'));
    } finally {
      setBusyId(null);
    }
  };

  if (!indicator) return null;

  return (
    <section className="evi-panel">
      <header className="evi-panel-head">
        <div>
          <h3>{t('evi.heading')}</h3>
          <p className="evi-hint">{t('evi.intro')}</p>
        </div>
        <span className="evi-panel-ind">{indicator.code}</span>
      </header>

      {loading && <p className="evi-hint">{t('evi.loading')}</p>}

      {!loading && rows.length === 0 && (
        <div className="evi-empty">
          <strong>{t('evi.noEvidence')}</strong>
          <span>{t('evi.noEvidenceHint')}</span>
        </div>
      )}

      <ul className="evi-list">
        {rows.map((row) => {
          const a = row.analysis;
          const state = analysisState(a);
          const busy = busyId === row.id;
          const actionable = a?.status === 'complete' && a.review_state === 'proposed'
            && (a.reconciliation === 'new_progress' || a.reconciliation === 'conflicting');
          return (
            <li key={row.id} className="evi-item">
              <div className="evi-item-head">
                <button type="button" className="evi-doc" onClick={() => openIndicatorEvidence(row.file_url).catch((e) => toast.error(e.message))}>
                  <strong>{row.title}</strong>
                  <small>
                    {[row.document_type, row.document_date ? fmtDate(row.document_date) : null, row.reporting_period]
                      .filter(Boolean).join(' · ')}
                  </small>
                </button>
                <EvidenceBadge state={state} />
              </div>

              {a?.status === 'complete' && (
                <div className="evi-finding">
                  {a.relevance_reason && <p className="evi-reason">{a.relevance_reason}</p>}

                  {a.extracted_value != null && (
                    <p className="evi-figure">
                      <strong>{fmtNum(a.extracted_value)}</strong>
                      {a.extracted_unit ? <span> {a.extracted_unit}</span> : null}
                      {a.extracted_period ? <span className="evi-muted"> · {a.extracted_period}</span> : null}
                    </p>
                  )}

                  {a.reconciliation_detail && <p className="evi-reconcile">{a.reconciliation_detail}</p>}

                  {a.evidence_quote && (
                    <blockquote className="evi-quote">
                      <span className="evi-quote-label">{t('evi.quote')}</span>
                      “{a.evidence_quote}”
                      {a.source_location ? <cite>{t('evi.foundIn')}: {a.source_location}</cite> : null}
                    </blockquote>
                  )}

                  <p className="evi-meta">
                    {a.confidence != null && (
                      <span className={a.confidence < 0.5 ? 'evi-warn-text' : undefined}>
                        {t('evi.confidence')}: {Math.round(a.confidence * 100)}%
                      </span>
                    )}
                    {a.doc_pages ? <span>{t('evi.pages', { count: a.doc_pages })}</span> : null}
                    {a.doc_chars ? <span>{t('evi.chars', { count: a.doc_chars })}</span> : null}
                  </p>

                  {a.confidence != null && a.confidence < 0.5 && (
                    <p className="evi-warn-text">{t('evi.lowConfidence')}</p>
                  )}
                  {a.raw?.doc_truncated && <p className="evi-warn-text">{t('evi.docTruncated')}</p>}
                  {a.review_state === 'accepted' && <p className="evi-ok-text">{t('evi.appliedAs')}</p>}
                </div>
              )}

              {a?.status === 'failed' && (
                <p className="evi-warn-text">{t('evi.readFailed')}: {a.error_message}</p>
              )}
              {a && ['queued', 'extracting', 'analysing'].includes(a.status) && (
                <p className="evi-hint">{t('evi.analysisQueued')}</p>
              )}

              {canEdit && (
                <div className="evi-actions">
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(row.id)}>
                    {a ? t('evi.reRun') : t('evi.runAnalysis')}
                  </button>
                  {actionable && (
                    <>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => accept(a)}>
                        {t('evi.accept')}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => dismiss(a)}>
                        {t('evi.reject')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
