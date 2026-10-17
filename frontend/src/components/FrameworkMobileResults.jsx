import ResultAchievement from './ResultAchievement';
import { useTranslation } from 'react-i18next';
import ResultComparison from './ResultComparison';
import { fmtNum } from '../lib/locale';
import { useMemo, useState } from 'react';
import { frameworkGroups } from '../lib/docc/frameworkGroups';
import { frameworkTargetValue } from '../lib/docc/frameworkTarget';
import * as OPT from '../constants/formOptions';

const display = value => value === '' || value == null ? '—' : String(value);
const percent = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${fmtNum(Number(value))}%`;

export default function FrameworkMobileResults({ rows, canEdit, editRow, editNode, attachIndicator, status, nodeTypeLabel, onEvidence, workingState, activities = [], activityError, onRetry }) {
  const { t } = useTranslation();
  const groups = useMemo(() => frameworkGroups(rows), [rows]);
  const [expanded, setExpanded] = useState(null);
  const projectIds = new Set(rows.map(row => row.project.id));
  const activityGroups = new Map(groups.map(group => {
    const nodeIds = new Set(group.rows.flatMap(row => {
      const start = row.path.findIndex(node => node.id === group.node?.id);
      return start < 0 ? [] : row.path.slice(start).map(node => node.id);
    }));
    return [group.key, activities.filter(activity => activity.project_id === group.project.id && nodeIds.has(activity.framework_node_id))];
  }));
  const linkedIds = new Set([...activityGroups.values()].flat().map(activity => activity.id));
  const otherActivities = activities.filter(activity => projectIds.has(activity.project_id) && !linkedIds.has(activity.id));
  const activityList = items => <ul className="rf2-linked-activities">{items.map(activity => <li key={activity.id}>
    <strong>{activity.code ? `${activity.code} — ` : ''}{activity.name}</strong>
    <p>{t('rf.status')}: {t(`rf.states.${activity.status}`, { defaultValue:activity.status || t('rf.notRecorded') })}{activity.physical_progress_pct != null ? ` · ${t('rf.progress')}: ${percent(activity.physical_progress_pct)}` : ''}</p>
    <a href={`#/project-setup?project=${encodeURIComponent(activity.project_id)}`}>{t('rf.viewActivities')}</a>
  </li>)}</ul>;
  return <div className="rf2-result-groups">
    <p className="rf2-reading-help">{t('rf.readingHelp')}</p>
    {groups.map((group, index) => <details className="rf2-result-group" key={group.key}
      open={expanded === group.key || (expanded === null && index === 0)}
      onToggle={event => {
        const isOpen = event.currentTarget.open;
        setExpanded(previous => isOpen ? group.key : previous === group.key ? 'closed' : previous);
      }}>
      <summary><span><small>{group.project.code || group.project.acronym || group.project.name} · {group.node ? nodeTypeLabel(group.node.node_type) : t('rf.unlinked')}</small>
        <strong>{group.node ? `${group.node.node_code ? `${group.node.node_code} — ` : ''}${group.node.title}` : group.project.name}</strong>
        <small>{t('rf.indicatorCount', { count:group.rows.filter(row => row.indicator).length })}</small></span></summary>
      <div className="rf2-group-content">
        {group.rows.map(row => {
          const editable = canEdit(row.project.id);
          const indicator = row.indicator;
          const edit = (field, label) => editable && indicator && <button type="button" className="rf2-mobile-edit"
            aria-label={`${t('rf.editField', { field:label })}: ${indicator.code || indicator.name}`} onClick={() => editRow(row, field)}>{t('rf.edit')}</button>;
          const cells = indicator ? [
            ['baseline', t('rf.baseline'), display(frameworkTargetValue(row.targets.baseline, indicator.baseline_value))],
            ['mid_term', t('rf.mid_term'), display(frameworkTargetValue(row.targets.mid_term))],
            ['final', t('rf.final'), display(frameworkTargetValue(row.targets.final, indicator.target_value))],
            ['actual', t('rf.actual'), display(row.progress?.cumulative_actual ?? row.progress?.actual_this_period)],
            ['progress', t('rf.progress'), percent(row.comparison?.achievement)],
          ] : [];
          return <article className="rf2-result-card reading-result-card" key={indicator?.id || row.node.id}>
            <small>{row.project.name}</small>
            <h2>{indicator?.code && <span>{indicator.code} · </span>}{indicator?.name || row.node.title}</h2>
            {edit('indicator', t('rf.indicator'))}
            {row.path.length > 0 && <details className="rf2-mobile-path"><summary>{t('rf.frameworkText')}</summary>
              {row.path.map(node => <div key={node.id}><p><strong>{nodeTypeLabel(node.node_type)}{node.node_code ? ` ${node.node_code}` : ''}:</strong> {node.title}</p>
                {editable && <button type="button" className="rf2-mobile-edit" aria-label={`${t('rf.editField', { field:nodeTypeLabel(node.node_type) })}: ${node.node_code || node.title}`} onClick={() => editNode(node)}>{t('rf.edit')}</button>}
                {node.description && <p>{node.description}</p>}
              </div>)}
            </details>}
            {indicator ? <>
              <p><strong>{t('rf.unitLabel')}</strong> {indicator.unit || t('rf.notRecorded')}</p>
              <p className="rf2-period-context"><strong>{t('rf.periodLabel')}</strong> {row.progress?.reporting_period || t('rf.noReported')}</p>
              <div className="reading-result-summary">
              <dl>{cells.map(([field, label, value]) => <div key={field}><dt>{label}</dt><dd>{value}</dd>{edit(field, label)}</div>)}</dl>
              <div className="reading-result-evidence"><button type="button" className="btn btn-secondary" onClick={() => onEvidence(indicator)}>{t('rf.viewEvidence')}</button><p>{t('reading.evidenceHelp')}</p></div>
              </div>
              <ResultAchievement value={row.comparison?.achievement} />
              <ResultComparison result={row.comparison} />
              {workingState?.(row)}
              <div className="rf2-mobile-status">{status(row)}{edit('status', t('rf.status'))}</div>
              <div className="rf2-mobile-update"><h3>{t('rf.reportedUpdate')}</h3><p>{row.narrative?.progress_summary || row.progress?.narrative || t('rf.noNarrative')}</p>{edit('narrative', t('rf.narrative'))}</div>
              <p><strong>{t('rf.frequencyLabel')}</strong> {OPT.labelOf(OPT.REPORTING_FREQUENCY, indicator.official_reporting_frequency || indicator.frequency) || t('rf.notRecorded')}</p>
              {edit('reporting', t('rf.reporting'))}

            </> : <><p>{t('rf.noAttached')}</p>
              {editable && <button type="button" className="rf2-mobile-edit" onClick={() => attachIndicator(row)}>{t('rf.addIndicator')}</button>}
            </>}
          </article>;
        })}
        <section className="rf2-activities"><h3>{t('rf.linkedActivities')}</h3>
          {activityError ? <p role="alert">{activityError} <button type="button" className="rf2-mobile-edit" onClick={onRetry}>{t('rf.retry')}</button></p>
            : activityGroups.get(group.key).length ? activityList(activityGroups.get(group.key)) : <p>{t('rf.noLinkedActivities')}</p>}
        </section>
      </div>
    </details>)}
    {otherActivities.length > 0 && <details className="rf2-result-group"><summary>{t('rf.otherActivities')}</summary><div className="rf2-group-content">{activityList(otherActivities)}</div></details>}
  </div>;
}

export function FrameworkActivities({ rows, activities, error, onRetry }) {
  const { t } = useTranslation();
  const ids = new Set(rows.map(row => row.project.id));
  const items = activities.filter(activity => ids.has(activity.project_id));
  return <section className="rf2-activities rf2-desktop-activities"><h2>{t('rf.projectActivities')}</h2>
    {error ? <p role="alert">{error} <button type="button" className="btn btn-secondary" onClick={onRetry}>{t('rf.retry')}</button></p>
      : items.length ? <ul className="rf2-linked-activities">{items.map(activity => <li key={activity.id}><strong>{activity.code} — {activity.name}</strong><p>{t('rf.status')}: {t(`rf.states.${activity.status}`, { defaultValue:activity.status || t('rf.notRecorded') })}{activity.physical_progress_pct != null && <> · {t('rf.progress')}: {percent(activity.physical_progress_pct)}</>}</p><a href={`#/project-setup?project=${encodeURIComponent(activity.project_id)}`}>{t('rf.viewActivities')}</a></li>)}</ul> : <p>{t('rf.noLinkedActivities')}</p>}
  </section>;
}
