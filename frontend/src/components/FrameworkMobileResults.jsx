import { useMemo, useState } from 'react';
import { frameworkGroups } from '../lib/docc/frameworkGroups';
import { frameworkTargetValue } from '../lib/docc/frameworkTarget';
import * as OPT from '../constants/formOptions';

const display = value => value === '' || value == null ? '—' : String(value);
const percent = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value))}%`;

export default function FrameworkMobileResults({ rows, canEdit, editRow, editNode, attachIndicator, status, nodeTypeLabel, onEvidence }) {
  const groups = useMemo(() => frameworkGroups(rows), [rows]);
  const [expanded, setExpanded] = useState(null);
  return <div className="rf2-result-groups">
    <p className="rf2-reading-help">Open an outcome or output to view its indicators. Each figure shows its recorded unit and reporting period.</p>
    {groups.map((group, index) => <details className="rf2-result-group" key={group.key}
      open={expanded === group.key || (expanded === null && index === 0)}
      onToggle={event => {
        const isOpen = event.currentTarget.open;
        setExpanded(previous => isOpen ? group.key : previous === group.key ? 'closed' : previous);
      }}>
      <summary><span><small>{group.project.code || group.project.acronym || group.project.name} · {group.node ? nodeTypeLabel(group.node.node_type) : 'Unlinked indicators'}</small>
        <strong>{group.node ? `${group.node.node_code ? `${group.node.node_code} — ` : ''}${group.node.title}` : group.project.name}</strong>
        <small>{group.rows.filter(row => row.indicator).length} indicators</small></span></summary>
      <div className="rf2-group-content">
        {group.rows.map(row => {
          const editable = canEdit(row.project.id);
          const indicator = row.indicator;
          const edit = (field, label) => editable && indicator && <button type="button" className="rf2-mobile-edit"
            aria-label={`Edit ${label}: ${indicator.code || indicator.name}`} onClick={() => editRow(row, field)}>Edit</button>;
          const cells = indicator ? [
            ['baseline', 'Baseline', display(frameworkTargetValue(row.targets.baseline, indicator.baseline_value))],
            ['mid_term', 'Mid-term', display(frameworkTargetValue(row.targets.mid_term))],
            ['final', 'Final target', display(frameworkTargetValue(row.targets.final, indicator.target_value))],
            ['actual', 'Latest actual', display(row.progress?.cumulative_actual ?? row.progress?.actual_this_period)],
            ['progress', 'Progress', percent(row.progress?.achievement_pct)],
          ] : [];
          return <article className="rf2-result-card" key={indicator?.id || row.node.id}>
            <small>{row.project.name}</small>
            <h2>{indicator?.code && <span>{indicator.code} · </span>}{indicator?.name || row.node.title}</h2>
            {edit('indicator', 'Indicator')}
            {row.path.length > 0 && <details className="rf2-mobile-path"><summary>Framework text</summary>
              {row.path.map(node => <div key={node.id}><p><strong>{nodeTypeLabel(node.node_type)}{node.node_code ? ` ${node.node_code}` : ''}:</strong> {node.title}</p>
                {editable && <button type="button" className="rf2-mobile-edit" aria-label={`Edit ${nodeTypeLabel(node.node_type)}: ${node.node_code || node.title}`} onClick={() => editNode(node)}>Edit</button>}
                {node.description && <p>{node.description}</p>}
              </div>)}
            </details>}
            {indicator ? <>
              <p><strong>Unit:</strong> {indicator.unit || 'Not recorded'}</p>
              <p className="rf2-period-context"><strong>Reporting period:</strong> {row.progress?.reporting_period || 'No reported result yet'}</p>
              <dl>{cells.map(([field, label, value]) => <div key={field}><dt>{label}</dt><dd>{value}</dd>{edit(field, label)}</div>)}</dl>
              <div className="rf2-mobile-status">{status(row)}{edit('status', 'Status')}</div>
              <div className="rf2-mobile-update"><h3>Reported update</h3><p>{row.narrative?.progress_summary || row.progress?.narrative || 'No narrative recorded.'}</p>{edit('narrative', 'Narrative')}</div>
              <p><strong>Reporting frequency:</strong> {OPT.labelOf(OPT.REPORTING_FREQUENCY, indicator.official_reporting_frequency || indicator.frequency) || 'Not recorded'}</p>
              {edit('reporting', 'Reporting')}
              <button type="button" className="rf2-mobile-edit" onClick={() => onEvidence(indicator)}>View evidence</button>
            </> : <><p>No indicator or reported progress is attached to this result.</p>
              {editable && <button type="button" className="rf2-mobile-edit" onClick={() => attachIndicator(row)}>Add indicator</button>}
            </>}
          </article>;
        })}
      </div>
    </details>)}
  </div>;
}
