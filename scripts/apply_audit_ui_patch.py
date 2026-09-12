from pathlib import Path


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)


p = Path('frontend/src/pages/ProjectSetup.jsx')
s = p.read_text()
s = must_replace(s, "import PageHeader from '../components/ui/PageHeader';\n", "import PageHeader from '../components/ui/PageHeader';\nimport ActivityManager from '../components/ActivityManager';\n", 'ActivityManager import')
s = must_replace(s, "{ label: 'Performance Status', type: 'select', options: ['On track', 'At risk', 'Off track', 'Completed'] },", "{ label: 'Performance Status', type: 'select', options: ['On Track', 'Attention Required', 'Off Track', 'Target Achieved', 'No Data'], help: 'Use the same controlled status available in the live reporting form; do not infer a positive status when no data has been reported.' },", 'performance options')
s = must_replace(s, "{ label: 'Cumulative Achievement', type: 'number' },", "{ label: 'Cumulative Achievement', type: 'number', help: 'Enter the cumulative value to the end of this reporting period. Leave blank when it has not been reported; enter 0 only when zero was explicitly measured.' },", 'cumulative achievement')
s = must_replace(s, "{ label: 'Cumulative Expenditure', type: 'number' },", "{ label: 'Cumulative Expenditure', type: 'number', help: 'Total expenditure to date in the project currency. Leave blank when unreported; a recorded zero is different from missing financial information.' },", 'cumulative expenditure')
s = must_replace(s, "{ label: 'Double-counting Check Completed', type: 'checkbox' },", "{ label: 'Double-counting Check Completed', type: 'checkbox', help: 'Confirm whether beneficiary records were checked for overlap before totals are aggregated. Youth and disability categories can overlap with sex-disaggregated totals.' },", 'double counting')
s = must_replace(s, "{ label: 'Category', type: 'select', options: ['Technical', 'Financial', 'Operational', 'Safeguards', 'Governance', 'Other'] },", "{ label: 'Category', type: 'select', options: ['Financial', 'Technical', 'Operational', 'Environmental', 'Social / GEDSI', 'Governance', 'Procurement', 'Safeguards', 'Other'] },", 'risk categories')
s = must_replace(s, "{ label: 'Likelihood', type: 'select', options: ['Low', 'Medium', 'High'] },", "{ label: 'Likelihood', type: 'select', options: ['1', '2', '3', '4', '5'], help: 'Use the standard 1–5 likelihood scale used by the live risk form.' },", 'risk likelihood')
s = must_replace(s, "{ label: 'Impact', type: 'select', options: ['Low', 'Medium', 'High'] },", "{ label: 'Impact', type: 'select', options: ['1', '2', '3', '4', '5'], help: 'Use the standard 1–5 impact scale used by the live risk form.' },", 'risk impact')
s = must_replace(s, "{ label: 'Current Status', type: 'select', options: ['Open', 'Monitoring', 'Resolved', 'Closed'] },", "{ label: 'Current Status', type: 'select', options: ['Open', 'Monitoring', 'Escalated', 'Resolved', 'Closed'] },", 'risk status')
s = must_replace(s, "{ label: 'Reporting Period Type', type: 'select', options: ['Monthly', 'Quarterly', 'Semi-annual', 'Annual', 'Other'] },", "{ label: 'Reporting Period Type', type: 'select', options: ['Monthly', 'Quarterly', 'Six-monthly', 'Annual', 'Final', 'Ad hoc'] },", 'period types')
s = must_replace(s, "{ label: 'Document Type', type: 'select', options: ['Report', 'Photo', 'Attendance Sheet', 'Dataset', 'Map', 'Invoice', 'Other'] },", "{ label: 'Document Type', type: 'select', options: ['Attendance List', 'Photograph', 'Monitoring Report', 'Survey / Data', 'Financial Report', 'Contract', 'Completion Report', 'Evaluation', 'Map', 'Other'] },", 'document types')
s = must_replace(s, "{ label: 'Verification Status', type: 'select', options: ['Pending', 'Verified', 'Rejected'] },", "{ label: 'Verification Status', type: 'select', options: ['Pending', 'Verified', 'Rejected', 'Superseded'] },", 'verification status')
s = must_replace(s, '<p>Reference only. This page explains what each reporting form collects. Actual data entry, editing, saving and submission happens in MERL Reporting.</p>', '<p>Field examples are read-only. This page explains what each reporting form collects. Actual reporting data is entered, edited, saved and submitted in MERL Reporting; Activities & Workplan (Form 5) is entered under Manage projects.</p>', 'reference wording')
s = must_replace(s, '<strong>No controls on this page are interactive.</strong>', '<strong>Field examples are read-only.</strong>', 'reference callout')
marker = "function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin }) {\n"
repl = "function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin }) {\n  const routeProjectId = (() => {\n    try {\n      const query = window.location.hash.split('?')[1] || '';\n      return new URLSearchParams(query).get('project') || '';\n    } catch { return ''; }\n  })();\n"
s = must_replace(s, marker, repl, 'ProjectConfiguration')
s = must_replace(s, "const preferred = (ps || []).some((p) => p.id === preferredProjectId) ? preferredProjectId : '';", "const requested = preferredProjectId || routeProjectId;\n      const preferred = (ps || []).some((p) => p.id === requested) ? requested : '';", 'preferred project')
end_marker = "      </div>\n    </div>}\n  </section>;\n}"
s = must_replace(s, end_marker, "      </div>\n      <ActivityManager projectId={projectId} canEdit={canEdit} />\n    </div>}\n  </section>;\n}", 'activity manager render')
p.write_text(s)

p = Path('frontend/src/pages/ReviewApproval.jsx')
s = p.read_text()
old = """        empty={{
          title: t(filter === 'queue' ? 'merl.emptyQueueTitle' : 'merl.emptyAllTitle'),
          description: t(filter === 'queue' ? 'merl.emptyQueueBody' : 'merl.emptyAllBody'),
        }}"""
new = """        empty={{
          title: filter === 'queue'
            ? (rows.length === 0 ? 'No reporting periods configured' : 'No submissions awaiting review')
            : t('merl.emptyAllTitle'),
          description: filter === 'queue'
            ? (rows.length === 0
              ? 'Create a reporting period in MERL Reporting before expecting submissions in this queue.'
              : 'There are currently no submitted, reviewed or returned periods requiring action.')
            : t('merl.emptyAllBody'),
        }}"""
s = must_replace(s, old, new, 'review empty state')
p.write_text(s)

p = Path('frontend/src/pages/MerlReporting.jsx')
s = p.read_text()
s = must_replace(s, "<div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}\n      onClick={closeKeepingDraft}>", "<div role=\"dialog\" aria-modal=\"true\" aria-label={`${initial?.id ? t('merl.edit') : t('merl.add')} — ${t(module.label)}`} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }}\n      onClick={closeKeepingDraft}>", 'record dialog')
s = must_replace(s, '<textarea className="field-input" rows={2} value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)} />', '<textarea aria-label={t(f.label)} className="field-input" rows={2} value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)} />', 'textarea label')
s = must_replace(s, '<select className="field-input" value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)}>', '<select aria-label={t(f.label)} className="field-input" value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)}>', 'select label')
s = must_replace(s, '<input type="checkbox" checked={!!v[f.name]} onChange={set(f.name, f.type)} style={{ width: 18, height: 18 }} />', '<input aria-label={t(f.label)} type="checkbox" checked={!!v[f.name]} onChange={set(f.name, f.type)} style={{ width: 18, height: 18 }} />', 'checkbox label')
s = must_replace(s, '<input type={f.type} className="field-input" value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)} />', '<input aria-label={t(f.label)} type={f.type} className="field-input" value={v[f.name] ?? \'\'} onChange={set(f.name, f.type)} />', 'input label')
p.write_text(s)
