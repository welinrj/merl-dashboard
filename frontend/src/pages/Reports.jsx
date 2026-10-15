import ReportReadiness, { ReadinessExportSummary } from '../components/ReportReadiness';
import { reportReadiness, rowMatchesReportScope } from '../lib/docc/reportReadiness';
import { useWorkspaceContext } from '../components/WorkspaceContext';
import { indicatorTargets, resultComparison } from '../lib/docc/resultComparison';
import { loadReportFonts } from '../lib/reportFonts';
import { renderReportPdf } from '../lib/reportPdf';
import IslandReportCover from '../components/IslandReportCover';
import { wordCover, pdfCover } from '../lib/islandReportCover';
import { scopeProjectReport, initialReportType } from '../lib/projectReportScope';
import { officialPortfolioData } from '../lib/docc/projectScope';
// =============================================================================
// Reports.jsx — DoCC MERL report generators, built directly from the
// standardised dataset (the "REPORT" end of ENTER ONCE -> STORE -> DISPLAY ->
// REPORT). No separate report datasets: every report reads the public.v_*
// views and renders a printable document (Print -> Save as PDF).
// Report types: Project Progress, Portfolio Performance, Indicator Performance,
// Financial Performance, Geographic/Provincial, Funding Partner/Donor.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Document, HeadingLevel, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, Footer, PageNumber, AlignmentType } from 'docx';
import { jsPDF } from 'jspdf';
import { Download, FileText, Printer } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import PageHeader from '../components/ui/PageHeader';
import { fmtAmount, fmtPct, utilisationPct } from '../lib/docc/reporting';
import { compareReportedRows, latestReportedBy, withReportingDates } from '../lib/docc/progressSelection';
import { useLiveDashboard } from '../lib/useLiveDashboard';
import { portfolioBeneficiaries } from '../lib/docc/projectAnalysis';
import { useTranslation } from 'react-i18next';
import { fmtDateTime, fmtNum } from '../lib/locale';
import { localised, i18nCols } from '../lib/contentLocale';

const PERIOD_TYPES = [
  { value: '', label: '' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'six_monthly', label: 'Six-monthly' },
  { value: 'annual', label: 'Annual' },
];

const REPORT_TYPES = [
  { key: 'full_me',    label: 'rpt.fullMeReport' },
  { key: 'project',    label: 'rpt.projectProgressReport' },
  { key: 'portfolio',  label: 'rpt.portfolioPerformanceReport' },
  { key: 'indicator',  label: 'rpt.indicatorPerformanceReport' },
  { key: 'financial',  label: 'rpt.financialPerformanceReport' },
  { key: 'geographic', label: 'rpt.geographicReport' },
  { key: 'donor',      label: 'rpt.donorReport' },
];

const hasValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const sumKnown = (values) => values.length && values.every(hasValue)
  ? values.reduce((total, value) => total + Number(value), 0)
  : null;
const remainingBalance = (budget, expenditure) => hasValue(budget) && hasValue(expenditure)
  ? Number(budget) - Number(expenditure)
  : null;
const humanToken = (value) => value
  ? String(value).replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  : '—';
const periodMatches = (row, period) => !period || row?.reporting_period === period || row?.period_label === period;
const rowMatchesPeriodScope = rowMatchesReportScope;
const projectBudgetValue = (project, financial) => {
  if (hasValue(financial?.approved_budget)) return financial.approved_budget;
  if (Number(project?.budget_vuv) > 0 || project?.approved_budget_confirmed === true) return project?.budget_vuv;
  return null;
};
const projectExpenditureValue = (project, financial, period) => {
  if (hasValue(financial?.cumulative_expenditure)) return financial.cumulative_expenditure;
  if (!period && Number(project?.spent_vuv) > 0) return project?.spent_vuv;
  return null;
};
function latestByProject(rows) { return latestReportedBy(rows, 'project_id'); }

const isOfficialProject = (project) => project?.code !== 'AUDIT-2026'
  && !/non-production staging|do not use for official reporting/i.test(project?.description || '');
const pctOf = (value, total) => total > 0 ? `${Math.round((value / total) * 100)}%` : '—';
const knownOrMissing = (value, suffix = '') => hasValue(value) ? `${fmtAmount(value)}${suffix}` : 'Not reported';

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari/iPad can still be consuming the object URL after link.click().
  // Revoking synchronously can interrupt the download or destabilise the page.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};
const reportBlocks = () => {
  const root = document.getElementById('report-preview');
  if (!root) throw new Error('The report preview is not available.');
  const textOf = element => {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    clone.querySelectorAll('strong').forEach(node => node.append(' '));
    clone.querySelectorAll('small, .rp-result-line').forEach(node => node.prepend('\n'));
    return (clone.textContent || '').trim();
  };
  const blocks = [];
  const walk = (parent) => {
    for (const element of parent.children) {
      if (element.classList.contains('island-report-cover') || element.classList.contains('rp-noprint')) continue;
      if (element.classList.contains('rp-page-break')) { blocks.push({ type: 'pageBreak' }); continue; }
      if (element.matches('h2')) { blocks.push({ type: 'title', text: textOf(element) }); continue; }
      if (element.matches('h3')) { blocks.push({ type: 'heading1', text: textOf(element) }); continue; }
      if (element.matches('h4')) { blocks.push({ type: 'heading2', text: textOf(element) }); continue; }
      if (element.matches('p')) { blocks.push({ type: 'paragraph', text: textOf(element) }); continue; }
      if (element.matches('table')) {
        blocks.push({ type: 'table', rows: [...element.rows].map((row) => [...row.cells].map((cell) => textOf(cell))) });
        continue;
      }
      if (element.classList.contains('rp-meta') || element.classList.contains('rp-kpis') || element.classList.contains('rp-stamp')) {
        [...element.children].forEach((child) => blocks.push({ type: 'paragraph', text: textOf(child) }));
        continue;
      }
      if (!element.children.length && textOf(element)) { blocks.push({ type: 'paragraph', text: textOf(element) }); continue; }
      walk(element);
    }
  };
  walk(root);
  return blocks.filter((block) => block.type === 'pageBreak' || block.rows?.length || block.text);
};

export default function Reports({ user }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const liveRevision = useLiveDashboard();
  const requested = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [sourceD, setD] = useState(null);
  const [scopeId, setScopeId] = useState(() => requested.get('project') || '');
  const [type, setType] = useState(() => initialReportType(requested, REPORT_TYPES.map(r=>r.key)));
  const [projectId, setProjectId] = useState(() => requested.get('project') || '');
  const [province, setProvince] = useState('');
  const [donor, setDonor] = useState('');
  const [periodType, setPeriodType] = useState(() => PERIOD_TYPES.some(p=>p.value === requested.get('frequency')) ? requested.get('frequency') : '');
  const { period, selectPeriod: setPeriod, periodInfo } = useWorkspaceContext();
  useEffect(() => { if (period) setPeriodType(periodInfo?.period_type || ''); }, [period, periodInfo?.period_type]);
  const [runs, setRuns] = useState([]);
  const [dataError, setDataError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showCover, setShowCover] = useState(false);

  // Report Library (§48-51): recent official report generations, portfolio-wide.
  const loadRuns = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('v_report_runs').select('*')
        .order('generated_at', { ascending: false }).limit(20);
      if (!error) setRuns(Array.isArray(data) ? data : []);
    } catch {
      // The audit trail must never take down the report page or a completed export.
    }
  }, []);
  useEffect(() => { void loadRuns(); }, [loadRuns]);

  useEffect(() => {
    (async () => {
      setDataError('');
      // Rows arrive already in the reader's language; see lib/contentLocale.js.
      const q = (v, cols) => localised(() => supabase.from(v).select(i18nCols(cols)));
      const [proj, fin, risk, ben, act, ind, prog, rep, nodes, areas, orgs, narr, status, learn, evidence, targets, analyses] = await Promise.all([
        q('v_projects', '*'),
        q('v_financial_progress', '*'),
        q('v_risks_issues', '*'),
        q('v_beneficiaries', '*'),
        q('v_project_activities', '*'),
        q('v_project_indicators', '*'),
        q('v_indicator_progress', '*'),
        q('v_reporting_periods', '*'),
        q('v_framework_nodes', '*'),
        q('v_project_area_councils', '*'),
        q('v_project_organizations', '*'),
        q('v_result_narratives', '*'),
        q('v_project_portfolio_status', '*'),
        q('v_learning_updates', '*'),
        q('v_evidence', '*'),
        q('v_indicator_targets', '*'),
        q('v_evidence_analysis', '*'),
      ]);
      const results = [proj, fin, risk, ben, act, ind, prog, rep, nodes, areas, orgs, narr, status, learn, evidence, targets, analyses];
      const names = ['projects', 'financial progress', 'risks and issues', 'beneficiaries', 'activities', 'indicators', 'indicator progress', 'reporting periods', 'framework nodes', 'Area Council coverage', 'organizations', 'result narratives', 'portfolio status', 'learning updates', 'evidence', 'indicator targets', 'evidence source references'];
      const failures = results.map((result, index) => result.error ? names[index] : null).filter(Boolean);
      if (failures.length) {
        setD(null);
        setDataError(`The report could not load live data for: ${failures.join(', ')}. No report has been generated. Please retry after the data service is available.`);
        return;
      }
      setD(officialPortfolioData({
        projects: proj.data ?? [], financial: withReportingDates(fin.data ?? [], rep.data ?? []), risks: risk.data ?? [],
        beneficiaries: ben.data ?? [], activities: act.data ?? [], indicators: ind.data ?? [],
        progress: withReportingDates(prog.data ?? [], rep.data ?? []), reporting: rep.data ?? [], frameworkNodes: nodes.data ?? [],
        areaCouncils: areas.data ?? [], organizations: orgs.data ?? [], narratives: narr.data ?? [],
        portfolioStatus: status.data ?? [], learning: withReportingDates(learn.data ?? [], rep.data ?? []), evidence: evidence.data ?? [], analyses: analyses.data ?? [],
        targets: (targets.data ?? []).map(row => ({ ...row, project_id: (ind.data ?? []).find(i => i.id === row.indicator_id)?.project_id })),
      }));
      if ((proj.data ?? []).length) setProjectId(current => current || officialPortfolioData({ projects: proj.data ?? [] }).projects[0]?.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, liveRevision]);

  const d = scopeProjectReport(sourceD, type === 'project' ? projectId : scopeId);
  if (dataError) return <div className="page-pad"><div role="alert" className="card" style={{ padding: '1rem', color: 'var(--red-700)' }}>{dataError}</div></div>;
  if (!d) return <div className="page-pad"><p style={{ color: 'var(--text-3)' }}>{t('rpt.loading')}</p></div>;

  const donors = [...new Set([
    ...d.projects.map((p) => p.donor).filter(Boolean),
    ...d.organizations.filter((o) => ['donor','co_financier'].includes(o.role)).map((o) => o.name).filter(Boolean),
  ])].sort();
  const provinces = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA'];
  const periodOptions = [...new Map(
    d.reporting
      .filter((r) => !periodType || r.period_type === periodType)
      .map((r) => [r.period_label, r])
  ).values()].sort((a,b) => String(a.period_start || a.period_label).localeCompare(String(b.period_start || b.period_label)));

  // "Data as at" (§76): latest timestamp across the datasets this report reads.
  const times = [d.reporting, d.progress, d.financial, d.beneficiaries, d.risks, d.learning, d.activities, d.evidence]
    .flat().filter(row => !period || periodMatches(row, period)).flatMap((r) => [r?.updated_at, r?.created_at]).filter(Boolean).map((ts) => new Date(ts).getTime());
  const dataAsAt = times.length ? new Date(Math.max(...times)) : null;
  const generatedAt = new Date();
  const reportProjectIds = (() => {
    if (type === 'project') return new Set(projectId ? [projectId] : []);
    if (type === 'full_me') return new Set(d.projects.filter(isOfficialProject).map((project) => project.id));
    if (type === 'geographic' && province) {
      const ids = new Set(d.areaCouncils.filter((row) => row.province_code === province).map((row) => row.project_id));
      d.projects.filter((project) => (project.provinces || []).includes(province)).forEach((project) => ids.add(project.id));
      return ids;
    }
    if (type === 'donor' && donor) {
      const ids = new Set(d.organizations.filter((row) => row.name === donor && ['donor', 'co_financier'].includes(row.role)).map((row) => row.project_id));
      d.projects.filter((project) => project.donor === donor).forEach((project) => ids.add(project.id));
      return ids;
    }
    return new Set(d.projects.map((project) => project.id));
  })();
  const readiness = reportReadiness(d, { type, projectIds: reportProjectIds, period, frequency: periodType });
  const approvalScope = d.reporting.filter((row) =>
    periodMatches(row, period)
    && (!periodType || row.period_type === periodType)
    && reportProjectIds.has(row.project_id));
  const approvedCount = approvalScope.filter((row) => row.submission_status === 'approved').length;
  const approvalComplete = approvalScope.length > 0 && approvedCount === approvalScope.length
    && [...reportProjectIds].every(id => approvalScope.some(row => row.project_id === id));
  const approvalBasis = approvalScope.length === 0
    ? 'No matching reporting-period approval record is configured for this report scope. Treat the report as working information, not approved reporting.'
    : approvalComplete
      ? `${approvedCount} of ${approvalScope.length} matching reporting period${approvalScope.length === 1 ? '' : 's'} approved.`
      : `${approvedCount} of ${approvalScope.length} matching reporting period${approvalScope.length === 1 ? '' : 's'} approved. This report may include draft, submitted, returned or reviewed information.`;

  const cover = {
    title: periodType === 'annual' ? `Annual ${t(REPORT_TYPES.find(r => r.key === type)?.label || 'rpt.fullMeReport')}` : t(REPORT_TYPES.find(r => r.key === type)?.label || 'rpt.fullMeReport'),
    period: period || (periodType ? `${humanToken(periodType)} reporting periods` : 'Cumulative · All reporting periods'),
    project: (type === 'project' ? projectId : scopeId) ? d.projects[0]?.name : type === 'geographic' && province ? province : type === 'donor' && donor ? donor : t('resultDetail.portfolio'),
    status: t(approvalComplete ? 'resultDetail.approved' : 'resultDetail.working'),
    generated: fmtDateTime(generatedAt), dataAsAt: dataAsAt ? fmtDateTime(dataAsAt) : '',
  };
  const reportFilename = extension => `DoCC-${type}-${period || periodType}-${new Date().toISOString().slice(0, 10)}.${extension}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const logGeneration = async (format) => {
    try {
      const labelKey = REPORT_TYPES.find((r) => r.key === type)?.label;
      const label = labelKey ? t(labelKey) : type;
      const { error } = await supabase.rpc('log_report_run', {
        p_report_type: type,
        p_report_label: label,
        p_project_id: type === 'project' ? (projectId || null) : (scopeId || null),
        p_reporting_period: period || null,
        p_params: { format, period_type: periodType, province: type === 'geographic' ? (province || null) : null, donor: type === 'donor' ? (donor || null) : null },
      });
      if (!error) void loadRuns();
    } catch {
      // Export success must not depend on the optional audit log request.
    }
  };

  const showPreview = () => {
    setPreviewOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('report-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const generate = () => {
    void logGeneration('pdf');
    window.print();
  };

  const exportWord = async () => {
    setExporting('word'); setExportError('');
    try {
      const children = reportBlocks().map((block) => {
        if (block.type === 'pageBreak') return new Paragraph({ children: [new PageBreak()] });
        if (block.type === 'table') return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map((row, index) => new TableRow({ tableHeader: index === 0, children: row.map(cell => new TableCell({ shading: index === 0 ? { fill: 'EAF2F6' } : undefined, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: String(cell || '—').split('\n').map(text => new Paragraph({ children: [new TextRun({ text, bold: index === 0, size: 18 })], spacing: { after: 40 } })) })) })),
        });
        const heading = block.type === 'title' ? HeadingLevel.TITLE : block.type === 'heading1' ? HeadingLevel.HEADING_1 : block.type === 'heading2' ? HeadingLevel.HEADING_2 : undefined;
        return new Paragraph({ text: block.text, heading, keepNext: Boolean(heading), spacing: { after: heading ? 160 : 100 } });
      });
      const coverChildren = await wordCover(cover);
      const documentFile = new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '1A1A1A' } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${cover.status} · `, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 }), new TextRun({ text: ' / ', size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })] })] }) }, children: [...coverChildren, ...children] }] });
      downloadBlob(await Packer.toBlob(documentFile), reportFilename('docx'));
      void logGeneration('docx');
    } catch (error) {
      setExportError(error?.message || 'The Word report could not be generated.');
    } finally { setExporting(''); }
  };

  const exportPdf = async () => {
    setExporting('pdf'); setExportError('');
    try {
      const blocks = reportBlocks();
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      await loadReportFonts(pdf);
      await pdfCover(pdf, cover);
      renderReportPdf(pdf, blocks, cover);
      pdf.save(reportFilename('pdf'));
      void logGeneration('pdf');
    } catch (error) {
      setExportError(error?.message || 'The PDF report could not be generated.');
    } finally { setExporting(''); }
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        .rp-doc{background:#fff;border:1px solid var(--border);border-radius:12px;padding:2rem;margin-top:1rem;color:#1a1a1a;transition:max-height .25s ease}
        .rp-doc h2{font-family:var(--font-display);font-size:1.4rem;margin:0 0 .2rem}
        .rp-doc h3{font-size:1rem;margin:1.3rem 0 .5rem;padding-bottom:.25rem;border-bottom:2px solid var(--green-600);color:var(--green-800)}
        .rp-doc h4{font-size:.9rem;margin:.9rem 0 .3rem}
        .rp-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:.3rem .9rem;font-size:.82rem;margin:.6rem 0 0}
        .rp-meta b{color:#555}
        .rp-t{width:100%;border-collapse:collapse;font-size:.8rem;margin:.4rem 0}
        .rp-t th,.rp-t td{border:1px solid #ddd;padding:.35rem .5rem;text-align:left}
        .rp-t th{background:#f4f6f5;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#555}
        .rp-narr{font-size:.85rem;line-height:1.5;white-space:pre-wrap;margin:.2rem 0}
        .rp-muted{color:#888;font-size:.82rem}
        .rp-stamp{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.4rem;font-size:.72rem;color:#666;padding-bottom:.6rem;margin-bottom:.9rem;border-bottom:1px solid #eee}
        .rp-stamp b{color:#333}
        .rp-assurance{font-size:.78rem;line-height:1.45;padding:.65rem .75rem;margin:0 0 .9rem;border:1px solid #f0c36b;background:#fff8e7;color:#6b4f12;border-radius:8px}
        .rp-assurance.ok{border-color:#9ac7aa;background:#edf7f0;color:#245b35}
        .rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.55rem;margin:.75rem 0 1rem}
        .rp-kpi{padding:.75rem;border-radius:8px;background:#eef4fb;border:1px solid #d6e3f2;text-align:center}
        .rp-kpi strong{display:block;font-size:1.35rem;color:#174d91}
        .rp-kpi span{font-size:.7rem;color:#607086;text-transform:uppercase;letter-spacing:.03em}
        .rp-note{padding:.65rem .75rem;background:#f5f7f9;border-left:4px solid #1f5fbf;font-size:.8rem;line-height:1.45;margin:.6rem 0}
        .rp-project-block{margin-bottom:1.5rem}
        .rp-preview-toolbar{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:1rem;padding:.7rem .85rem;border:1px solid var(--border);border-radius:10px;background:var(--surface-1,#fff)}
        .rp-preview-toolbar strong{font-size:.9rem}
        .rp-preview-toolbar span{display:block;font-size:.76rem;color:var(--text-3);margin-top:.15rem}
        .rp-preview-collapsed{max-height:430px;overflow:hidden;position:relative}
        .rp-preview-collapsed::after{content:'';position:absolute;left:0;right:0;bottom:0;height:110px;pointer-events:none;background:linear-gradient(to bottom,rgba(255,255,255,0),#fff 78%)}
        .rp-preview-open{max-height:none;overflow:visible}
        .rp-doc:not(.rp-show-cover) .island-report-cover{display:none}
        .rp-t{display:block;overflow-x:auto;max-width:100%;white-space:normal}
        .rp-t td{min-width:75px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-line}
        .rp-result-line{display:block;margin-top:.25rem}
        .rp-result-line b{color:#364f63}
        .rp-doc h2,.rp-doc h3,.rp-doc h4{overflow-wrap:anywhere}
        .rp-preview-toolbar button{min-height:40px}
        .rp-doc p{overflow-wrap:anywhere}
        .rl-t{width:100%;border-collapse:collapse;font-size:.82rem}
        .rl-t th,.rl-t td{padding:.55rem .7rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .rl-t th{font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);background:var(--green-50)}
        .rl-t tbody tr:last-child td{border-bottom:none}
        @media (max-width:640px){.rp-meta{grid-template-columns:1fr}.rp-doc{padding:1.1rem}.rp-kpis{grid-template-columns:repeat(2,1fr)}.rp-preview-toolbar{align-items:flex-start;flex-direction:column}}
        @media print{
          body *{visibility:hidden !important}
          .rp-print,.rp-print *{visibility:visible !important}
          .rp-print{position:absolute;left:0;top:0;width:100%;border:none;border-radius:0;padding:0;max-height:none!important;overflow:visible!important}
          .rp-print::after{display:none!important}
          .rp-noprint{display:none !important}
          .rp-page-break{break-before:page;page-break-before:always}
          .rp-doc .island-report-cover{display:flex!important}
          .rp-t{display:table;overflow:visible}
          .rp-t thead{display:table-header-group}
          .rp-t tr{break-inside:avoid}
          .rp-doc h3,.rp-doc h4{break-after:avoid}
        }
      `}</style>

      <div className="rp-noprint">
        <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--text-3)' }}>{t('roleWorkflow.reportScope')}</p>
        <PageHeader
          title={t('rpt.reports')}
        />
      </div>

      <ReportReadiness result={readiness} period={period} readOnly={user?.role === 'ROLE_VIEWER'} />
      {/* Controls */}
      <div className="rp-noprint" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="field-label">{t('rpt.reportType')}</label>
          <select className="field-input" value={type} onChange={(e) => { setType(e.target.value); setPreviewOpen(false); }}>
            {REPORT_TYPES.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}
          </select>
        </div>
        {type !== 'project' && <div style={{flex:'1 1 240px',minWidth:0}}><label className="field-label" htmlFor="report-project-scope">Project to include</label><select id="report-project-scope" className="field-input" value={scopeId} onChange={e=>{setScopeId(e.target.value);if(e.target.value)setProjectId(e.target.value);setPreviewOpen(false);}}><option value="">All projects with results frameworks</option>{sourceD.projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></div>}
        {type === 'project' && (
          <div style={{ flex: '1 1 240px' }}>
            <label className="field-label">{t('rpt.project')}</label>
            <select className="field-input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setScopeId(e.target.value); setPreviewOpen(false); }}>
              {sourceD.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        )}
        {type === 'geographic' && (
          <div style={{ flex: '1 1 180px' }}>
            <label className="field-label">{t('rpt.provinceOptional')}</label>
            <select className="field-input" value={province} onChange={(e) => { setProvince(e.target.value); setPreviewOpen(false); }}>
              <option value="">{t('rpt.allProvinces')}</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {type === 'donor' && (
          <div style={{ flex: '1 1 200px' }}>
            <label className="field-label">{t('rpt.donorOptional')}</label>
            <select className="field-input" value={donor} onChange={(e) => { setDonor(e.target.value); setPreviewOpen(false); }}>
              <option value="">{t('rpt.allDonors')}</option>
              {donors.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          </div>
        )}
        <div style={{ flex: '0 1 165px' }}>
          <label className="field-label">Report frequency</label>
          <select className="field-input" value={periodType} onChange={(e) => { setPeriodType(e.target.value); setPeriod(''); setPreviewOpen(false); }}>
            {PERIOD_TYPES.map((p) => <option key={p.value} value={p.value}>{p.value ? p.label : t('workspace.allFrequencies')}</option>)}</select>
        </div>
        <div style={{ flex: '0 1 190px' }}>
          <label className="field-label">{t('rpt.reportingPeriod')}</label>
          <select className="field-input" value={period} onChange={(e) => { setPeriod(e.target.value); setPreviewOpen(false); }}>
            <option value="">{periodType ? `All ${PERIOD_TYPES.find(p => p.value === periodType)?.label.toLowerCase()} periods` : t('workspace.allPeriods')}</option>
            {period && !periodOptions.some(row => row.period_label === period) && <option value={period}>{period}</option>}
            {periodOptions.map((p) => <option key={p.period_label} value={p.period_label}>{p.period_label}</option>)}</select>
        </div>
        <button onClick={showPreview} disabled={Boolean(exporting) || readiness.empty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: '1px solid var(--green-700)', cursor: exporting ? 'wait' : 'pointer', color: 'var(--green-800)', background: '#fff' }}>
          <FileText size={16} /> Preview report
        </button>
        {<>
          <button onClick={exportWord} disabled={Boolean(exporting) || readiness.empty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: '1px solid var(--green-700)', cursor: exporting ? 'wait' : 'pointer', color: 'var(--green-800)', background: '#fff' }}>
            <Download size={16} /> {exporting === 'word' ? 'Generating Word…' : 'Download Word'}
          </button>
          <button onClick={exportPdf} disabled={Boolean(exporting) || readiness.empty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: exporting ? 'wait' : 'pointer', color: '#fff', background: 'var(--green-700)' }}>
            <Download size={16} /> {exporting === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </>}
        {type !== 'full_me' && <button onClick={generate} disabled={readiness.empty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--green-700)' }}>
          <Printer size={16} /> {t('rpt.generateReport')}
        </button>}
      </div>
      {exportError && <div className="rp-noprint" role="alert" style={{ color: 'var(--red-700)', marginTop: '.6rem', fontSize: '.85rem' }}>{exportError}</div>}

      <div className="rp-preview-toolbar rp-noprint">
        <div><strong>Generated report preview</strong><span>Review the live report below before downloading Word or PDF.</span></div>
        <button onClick={() => setPreviewOpen((open) => !open)} style={{ padding: '.45rem .75rem', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          {previewOpen ? 'Collapse preview' : 'View full report'}
        </button>
      </div>

      <button type="button" className="rp-noprint" onClick={() => setShowCover(value => !value)} style={{ minHeight:40, marginTop:8, border:0, background:'transparent', color:'var(--green-800)' }}>{t(showCover ? 'resultDetail.hideCover' : 'resultDetail.showCover')}</button>
      <div id="report-preview" className={`rp-doc rp-print ${previewOpen ? 'rp-preview-open' : 'rp-preview-collapsed'} ${showCover ? 'rp-show-cover' : ''}`}>
        <IslandReportCover {...cover} />
        <div className="rp-stamp">
          <span>{t('rpt.generated')} <b>{fmtDateTime(generatedAt)}</b></span>
          <span>{t('rpt.dataAsAt')} <b>{dataAsAt ? fmtDateTime(dataAsAt) : '—'}</b></span>
        </div>
        {(type === 'project' ? projectId : scopeId) && <p className="rp-report-scope"><strong>Project:</strong> {d.projects[0]?.name || 'Selected project is not available in your current report scope.'}</p>}
        {<div className={`rp-assurance${approvalComplete ? ' ok' : ''}`}>
          <p><b>{cover.status}.</b> {approvalBasis}</p>
        </div>}
        {type === 'full_me' && <FullMEReport d={d} period={period} periodType={periodType} dataAsAt={dataAsAt} />}
        {type === 'project' && <ProjectProgress d={d} projectId={projectId} period={period} periodType={periodType} />}
        {type === 'portfolio' && <Portfolio d={d} period={period} periodType={periodType} />}
        {type === 'indicator' && <IndicatorReport d={d} period={period} periodType={periodType} />}
        {type === 'financial' && <FinancialReport d={d} period={period} periodType={periodType} />}
        {type === 'geographic' && <GeographicReport d={d} province={province} period={period} periodType={periodType} />}
        {type === 'donor' && <DonorReport d={d} donor={donor} period={period} periodType={periodType} />}
        <ReadinessExportSummary result={readiness} />
      </div>

      {/* Report Library (§48-51): audit trail of official reports generated */}
      <div className="rp-noprint" style={{ marginTop: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{t('rpt.reportLibrary')}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginLeft: '0.25rem' }}>{t('rpt.recentlyGenerated')}</span>
        </div>
        {runs.length === 0 ? (
          <div className="card" style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-3)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            No reports generated yet. Use Generate report above to produce one — it will be logged here.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rl-t"><thead><tr><th>{t('rpt.report')}</th><th>{t('rpt.scope')}</th><th>{t('rpt.period')}</th><th>{t('rpt.generatedBy')}</th><th>{t('rpt.when')}</th></tr></thead>
              <tbody>{runs.map((r) => <tr key={r.id}>
                <td><b>{r.report_label || r.report_type}</b></td>
                <td>{r.project_code ? `${r.project_code}` : (r.params?.province || r.params?.donor || 'Portfolio')}</td>
                <td>{r.reporting_period || '—'}</td><td>{r.generated_by_name || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.generated_at)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const Section = ({ n, title, children }) => <div><h3>{n}. {title}</h3>{children}</div>;
function Narr({ text }) {
  const { t } = useTranslation();
  return text ? <p className="rp-narr">{text}</p> : <p className="rp-muted">{t('rpt.notReported')}</p>;
}

function IndicatorResults({ d, indicators, currentRows }) {
  const { t } = useTranslation();
  const targets = indicatorTargets(d.targets), latest = latestReportedBy(currentRows);
  const value = v => v == null || v === '' ? t('resultDetail.missing') : typeof v === 'number' ? fmtNum(v) : String(v);
  const line = (key, text) => <span className="rp-result-line"><b>{t(`resultDetail.${key}`)}:</b> {text}</span>;
  return <><p className="rp-muted">{t('resultDetail.methodNote')}</p><table className="rp-t rp-result-table"><thead><tr>{['indicator', 'context', 'observations', 'performance', 'source'].map(key => <th key={key}>{t(`resultDetail.${key}`)}</th>)}</tr></thead><tbody>{indicators.map(indicator => {
    const current = latest.get(indicator.id);
    const r = resultComparison(indicator, current, d.progress, targets.get(indicator.id), d.reporting);
    const sources = d.evidence.filter(e => e.indicator_id === indicator.id && (!e.reporting_period || e.reporting_period === r.period));
    const narrative = d.narratives.find(n => n.indicator_progress_id === current?.id)?.progress_summary || current?.narrative;
    return <tr key={indicator.id}>
      <td><strong>{indicator.code} — {indicator.name}</strong>{line('unit', value(indicator.unit))}{line('officer', value(indicator.responsible_officer))}</td>
      <td>{line('baseline', value(r.baseline))}{line('finalTarget', value(r.finalTarget))}{line('periodTarget', value(current?.period_target))}{line('target', value(r.target))}</td>
      <td>{line('period', value(r.period))}{line('basis', t(`resultDetail.${r.basis === 'period' ? 'periodBasis' : 'cumulative'}`))}{line('actual', value(r.actual))}{line('periodActual', value(current?.actual_this_period))}{line('previous', r.previous ? `${value(r.previousActual)} · ${r.previous.reporting_period}` : t('resultDetail.noPrevious'))}{narrative && line('narrative', narrative)}</td>
      <td>{line('achievement', r.achievement == null ? t('resultDetail.missing') : `${value(r.achievement)}%`)}{line('change', value(r.change))}{line('gap', value(r.gap))}{line('direction', t(`resultDetail.${r.direction}`, { defaultValue: r.direction }))}{line('status', OPT.labelOf(OPT.PERFORMANCE_STATUS, current?.performance_status) || t('resultDetail.missing'))}{line('approval', value(r.approval?.replaceAll('_', ' ')))}</td>
      <td>{sources.length ? sources.map(e => `${e.code || e.id} · ${e.title} · ${e.document_date || t('resultDetail.missing')} · ${e.verification_status}`).join('\n') : t('resultDetail.noEvidence')}</td>
    </tr>;
  })}{!indicators.length && <tr><td colSpan={5}>{t('rpt.noIndicators')}</td></tr>}</tbody></table></>;
}
function ReportEvidence({ d, rows }) {
  const { t } = useTranslation();
  const missing = t('resultDetail.missing');
  if (!rows.length) return <p className="rp-muted">{t('resultDetail.noEvidence')}</p>;
  return <table className="rp-t"><thead><tr>{['document', 'indicator', 'date', 'location', 'verification', 'analysis'].map(key => <th key={key}>{t(`resultDetail.${key}`)}</th>)}</tr></thead><tbody>{rows.map(e => {
    const analysis = (d.analyses || []).filter(a => a.evidence_id === e.id && a.review_state !== 'superseded').sort((a, b) => compareReportedRows(b, a))[0];
    const indicator = d.indicators.find(i => i.id === e.indicator_id);
    const safeUrl = /^https?:\/\//i.test(e.file_url || '') ? e.file_url : null;
    return <tr key={e.id}><td>{e.code || e.id} — {e.title}{safeUrl && <span className="rp-result-line"><a href={safeUrl} target="_blank" rel="noopener noreferrer">{safeUrl}</a></span>}</td><td>{indicator ? `${indicator.code} — ${indicator.name}` : missing}</td><td>{e.document_date || missing}<span className="rp-result-line">{e.reporting_period || missing}</span></td><td>{analysis?.source_location || missing}</td><td>{humanToken(e.verification_status)}</td><td>{analysis ? [humanToken(analysis.review_state), analysis.reviewed_by_name, analysis.reviewed_at].filter(Boolean).join(' · ') : missing}</td></tr>;
  })}</tbody></table>;
}
function ReportActions({ activities }) {
  const { t } = useTranslation();
  const actions = activities.filter(a => a.next_action);
  return <><h4>{t('resultDetail.actions')}</h4><table className="rp-t"><thead><tr>{['action', 'officer', 'due'].map(key => <th key={key}>{t(`resultDetail.${key}`)}</th>)}</tr></thead><tbody>{actions.map(a => <tr key={a.id}><td>{a.code} — {a.name}<span className="rp-result-line">{a.next_action}</span></td><td>{a.responsible_officer_name || a.responsible_officer || a.responsible_org || t('resultDetail.missing')}</td><td>{a.next_action_due || t('resultDetail.missing')}</td></tr>)}{!actions.length && <tr><td colSpan={3}>{t('resultDetail.missing')}</td></tr>}</tbody></table></>;
}

function FullMEReport({ d, period, periodType, dataAsAt }) {
  const officialProjects = d.projects.filter(isOfficialProject);
  const officialIds = new Set(officialProjects.map((project) => project.id));
  const isOfficialRow = (row) => officialIds.has(row.project_id);
  const inOfficialScope = (row) => officialIds.has(row.project_id)
    && rowMatchesPeriodScope(row, d.reporting, period, periodType);
  const financial = latestByProject(d.financial.filter(inOfficialScope));
  const indicators = d.indicators.filter((row) => officialIds.has(row.project_id));
  const progress = d.progress.filter(inOfficialScope);
  const activities = d.activities.filter(isOfficialRow);
  const risks = d.risks.filter(isOfficialRow);
  const beneficiaries = d.beneficiaries.filter(inOfficialScope);
  const evidence = d.evidence.filter(inOfficialScope);
  const areas = d.areaCouncils.filter((row) => officialIds.has(row.project_id));
  const nodes = d.frameworkNodes.filter((row) => officialIds.has(row.project_id));

  const projectStatusCounts = officialProjects.reduce((acc, project) => {
    const key = project.status || 'not_reported';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const actualBeneficiaries = portfolioBeneficiaries(beneficiaries);

  const byCurrency = new Map();
  for (const project of officialProjects) {
    const fin = financial.get(project.id);
    const budget = projectBudgetValue(project, fin);
    const expenditure = projectExpenditureValue(project, fin, period);
    if (!hasValue(budget)) continue;
    const currency = project.currency || 'VUV';
    const group = byCurrency.get(currency) || { budgets: [], expenditures: [], projects: 0 };
    group.budgets.push(budget);
    group.expenditures.push(expenditure);
    group.projects += 1;
    byCurrency.set(currency, group);
  }

  const periodLabel = period || `All ${PERIOD_TYPES.find((item) => item.value === periodType)?.label.toLowerCase() || ''} periods`;

  return <div>
    <h2>Portfolio Monitoring &amp; Evaluation Report</h2>
    <div className="rp-muted">All official projects · {periodLabel}</div>

    <Section n="1" title="Executive Summary">
      <div className="rp-kpis">
        <div className="rp-kpi"><strong>{officialProjects.length}</strong><span>Projects</span></div>
        <div className="rp-kpi"><strong>{projectStatusCounts.active || 0}</strong><span>Active projects</span></div>
        <div className="rp-kpi"><strong>{activities.length}</strong><span>Activities</span></div>
        <div className="rp-kpi"><strong>{actualBeneficiaries == null ? '—' : fmtNum(actualBeneficiaries)}</strong><span>Direct beneficiaries</span></div>
      </div>
      <p className="rp-narr">This report covers {officialProjects.length} projects for {periodLabel}: {projectStatusCounts.active || 0} active, {projectStatusCounts.completed || 0} completed, {projectStatusCounts.planning || 0} in planning and {projectStatusCounts.on_hold || 0} on hold. It summarises project objectives, implementation, results, finances, beneficiaries, geographic coverage, risks, achievements, lessons and next actions.</p>
    </Section>

    <Section n="2" title="Project Portfolio Overview">
      <table className="rp-t"><thead><tr><th>Code</th><th>Project</th><th>Project status</th><th>Funding partner</th><th>Implementing agency</th><th>Duration</th><th>Theme</th></tr></thead><tbody>
        {officialProjects.map((project) => {
          return <tr key={project.id}><td>{project.code}</td><td>{project.name}</td><td>{humanToken(project.status)}</td><td>{project.donor || 'Not reported'}</td><td>{project.executing_agency || project.lead_agency || 'Not reported'}</td><td>{project.start_date || '—'} → {project.end_date || '—'}</td><td>{humanToken(project.primary_climate_theme)}</td></tr>;
        })}
      </tbody></table>
    </Section>

    <div className="rp-page-break" />
    <Section n="3" title="Financial Performance by Currency">
      {byCurrency.size === 0 ? <p className="rp-muted">No financial figures are reported for the selected projects and period.</p> : <table className="rp-t"><thead><tr><th>Currency</th><th>Approved budget</th><th>Projects</th><th>Cumulative expenditure</th><th>Utilisation</th></tr></thead><tbody>
        {[...byCurrency.entries()].map(([currency, group]) => {
          const budget = sumKnown(group.budgets);
          const expenditure = sumKnown(group.expenditures);
          return <tr key={currency}><td>{currency}</td><td>{knownOrMissing(budget)}</td><td>{group.projects}</td><td>{knownOrMissing(expenditure)}</td><td>{fmtPct(utilisationPct(budget, expenditure))}</td></tr>;
        })}
      </tbody></table>}
    </Section>

    <Section n="4" title="Beneficiaries and GEDSI Results">
      <div className="rp-meta"><div><b>Direct beneficiaries reached</b> {actualBeneficiaries == null ? 'Not reported' : fmtNum(actualBeneficiaries)}</div><div><b>Female</b> {knownOrMissing(sumKnown(beneficiaries.map((row) => row.female)))}</div><div><b>Male</b> {knownOrMissing(sumKnown(beneficiaries.map((row) => row.male)))}</div><div><b>Youth</b> {knownOrMissing(sumKnown(beneficiaries.map((row) => row.youth)))}</div><div><b>Persons with disability</b> {knownOrMissing(sumKnown(beneficiaries.map((row) => row.persons_with_disability)))}</div></div>
    </Section>

    <Section n="5" title="Geographic Coverage">
      <table className="rp-t"><thead><tr><th>Project</th><th>Province</th><th>Area Council</th><th>Coverage</th><th>Feasibility</th><th>Note</th></tr></thead><tbody>
        {areas.map((area) => { const project = officialProjects.find((item) => item.id === area.project_id); return <tr key={area.id}><td>{project?.code || '—'}</td><td>{area.province_code || '—'}</td><td>{area.area_council_name || '—'}</td><td>{humanToken(area.coverage_status)}</td><td>{humanToken(area.feasibility_status)}</td><td>{area.feasibility_note || '—'}</td></tr>; })}
        {areas.length === 0 && <tr><td colSpan={6} className="rp-muted">No geographic coverage has been reported for this period.</td></tr>}
      </tbody></table>
    </Section>

    <div className="rp-page-break" />
    <Section n="6" title="Complete Project Reports">
      {officialProjects.map((project) => {
        const projectNodes = nodes.filter((row) => row.project_id === project.id);
        const projectIndicators = indicators.filter((row) => row.project_id === project.id);
        const projectProgress = progress.filter((row) => row.project_id === project.id);
        const projectActivities = activities.filter((row) => row.project_id === project.id);
        const projectRisks = risks.filter((row) => row.project_id === project.id);
        const projectAreas = areas.filter((row) => row.project_id === project.id);
        const projectEvidence = evidence.filter((row) => row.project_id === project.id);
        const projectBeneficiaries = beneficiaries.filter((row) => row.project_id === project.id);
        const learning = d.learning.filter((row) => row.project_id === project.id && inOfficialScope(row)).sort((a, b) => compareReportedRows(b, a))[0] || {};
        const financeRecord = financial.get(project.id);
        const budget = projectBudgetValue(project, financeRecord);
        const expenditure = projectExpenditureValue(project, financeRecord, period);
        return <div className="rp-project-block" key={project.id}>
          <h4>{project.code} — {project.name}</h4>
          <div className="rp-meta"><div><b>Project status</b> {humanToken(project.status)}</div><div><b>Funding partner</b> {project.donor || 'Not reported'}</div><div><b>Implementing agency</b> {project.executing_agency || project.lead_agency || 'Not reported'}</div><div><b>Duration</b> {project.start_date || '—'} → {project.end_date || '—'}</div><div><b>Budget</b> {knownOrMissing(budget)} {project.currency || 'VUV'}</div><div><b>Expenditure</b> {knownOrMissing(expenditure)} {project.currency || 'VUV'}</div><div><b>Utilisation</b> {fmtPct(utilisationPct(budget, expenditure))}</div><div><b>Direct beneficiaries</b> {portfolioBeneficiaries(projectBeneficiaries) == null ? 'Not reported' : fmtNum(portfolioBeneficiaries(projectBeneficiaries))}</div></div>
          <h4>Project objective and expected results</h4>
          <Narr text={project.description || project.objective} />
          <table className="rp-t"><thead><tr><th>Code</th><th>Result level</th><th>Expected result</th></tr></thead><tbody>{projectNodes.map((row) => <tr key={row.id}><td>{row.node_code || '—'}</td><td>{humanToken(row.node_type)}</td><td>{row.title}</td></tr>)}{projectNodes.length === 0 && <tr><td colSpan={3}>Not reported</td></tr>}</tbody></table>
          <h4>Indicator results</h4>
          <IndicatorResults d={d} indicators={projectIndicators} currentRows={projectProgress} />
          <h4>Activity implementation</h4>
          <table className="rp-t"><thead><tr><th>Activity</th><th>Status</th><th>Progress</th><th>Planned budget</th><th>Expenditure</th></tr></thead><tbody>{projectActivities.map((row) => <tr key={row.id || row.code}><td>{row.code ? `${row.code} — ` : ''}{row.name}</td><td>{humanToken(row.status)}</td><td>{row.physical_progress_pct == null ? 'Not reported' : `${row.physical_progress_pct}%`}</td><td>{knownOrMissing(row.planned_budget)}</td><td>{knownOrMissing(row.actual_expenditure)}</td></tr>)}{projectActivities.length === 0 && <tr><td colSpan={5}>Not reported</td></tr>}</tbody></table>
          <h4>Achievements and major results</h4><Narr text={[learning.key_achievements, learning.major_results].filter(Boolean).join('\n\n')} />
          <h4>Challenges, risks and mitigation</h4><Narr text={learning.challenges} />
          <table className="rp-t"><thead><tr><th>Risk / issue</th><th>Rating</th><th>Status</th><th>Mitigation</th></tr></thead><tbody>{projectRisks.map((row) => <tr key={row.id || row.code}><td>{row.description}</td><td>{row.risk_rating || 'Not reported'}</td><td>{humanToken(row.status)}</td><td>{row.mitigation || 'Not reported'}</td></tr>)}{projectRisks.length === 0 && <tr><td colSpan={4}>Not reported</td></tr>}</tbody></table>
          <h4>Geographic implementation</h4><p className="rp-narr">{projectAreas.length ? projectAreas.map((row) => [row.province_code, row.area_council_name].filter(Boolean).join(' — ')).join('; ') : 'Not reported'}</p>
          <h4>Lessons learned</h4><Narr text={learning.lessons_learned} />
          <h4>Next-period priorities and recommendations</h4><Narr text={[learning.next_period_priorities, learning.recommendations].filter(Boolean).join('\n\n')} />
          <ReportActions activities={projectActivities} /><h4>Supporting evidence</h4><ReportEvidence d={d} rows={projectEvidence} />
        </div>;
      })}
    </Section>

    <p className="rp-muted">Report generated {fmtDateTime(new Date())}{dataAsAt ? ` · Project data current to ${fmtDateTime(dataAsAt)}` : ''}.</p>
  </div>;
}

function ProjectProgress({ d, projectId, period, periodType }) {
  const { t } = useTranslation();
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return <p className="rp-muted">{t('rpt.selectProject')}</p>;
  const inScope = (row) => rowMatchesPeriodScope(row, d.reporting, period, periodType);
  const fin = latestByProject(d.financial.filter((f) => f.project_id === projectId && inScope(f))).get(projectId);
  const inds = d.indicators.filter((i) => i.project_id === projectId);
  const prog = d.progress.filter((x) => x.project_id === projectId && inScope(x));
  const acts = d.activities.filter((a) => a.project_id === projectId);
  const risks = d.risks.filter((r) => r.project_id === projectId);
  const locs = d.areaCouncils.filter((l) => l.project_id === projectId);
  const bens = d.beneficiaries.filter((b) => b.project_id === projectId && inScope(b));
  const learn = d.learning.filter((l) => l.project_id === projectId && inScope(l)).sort((a, b) => compareReportedRows(b, a))[0] || {};
  const budget = projectBudgetValue(p, fin);
  const exp = projectExpenditureValue(p, fin, period);
  const physAvg = acts.filter((a) => a.physical_progress_pct != null);
  const phys = physAvg.length ? Math.round(physAvg.reduce((a, x) => a + Number(x.physical_progress_pct), 0) / physAvg.length) : null;
  const indLast = (i) => latestReportedBy(prog).get(i.id);

  return <div>
    <h2>{t('rpt.projectProgressReport')}</h2><div className="rp-muted">{p.code} — {p.name}{period ? ` · ${period}` : ''}</div>
    <Section n="1" title={t('rpt.projectInformation')}><div className="rp-meta">
      <div><b>{t('rpt.projectId')}</b> {p.code}</div><div><b>{t('rpt.titleLbl')}</b> {p.name}</div>
      <div><b>{t('rpt.donorLbl')}</b> {p.donor || '—'}</div><div><b>{t('rpt.implementingLbl')}</b> {p.executing_agency || p.lead_agency || '—'}</div>
      <div><b>{t('rpt.durationLbl')}</b> {p.start_date || '—'} → {p.end_date || '—'}</div><div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)} {p.currency || 'VUV'}</div>
      <div><b>{t('rpt.locationsLbl')}</b> {(p.provinces || []).join(', ') || 'National'}</div><div><b>{t('rpt.reportingPeriodLbl')}</b> {period || `All ${PERIOD_TYPES.find((x)=>x.value===periodType)?.label.toLowerCase() || ''} periods`}</div>
    </div></Section>
    <Section n="2" title={t('rpt.executiveSummary')}><div className="rp-meta">
      <div><b>{t('rpt.overallStatusLbl')}</b> {OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</div>
      <div><b>{t('rpt.physicalProgressLbl')}</b> {phys != null ? `${phys}%` : '—'}</div>
      <div><b>{t('rpt.financialUtilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div>
      <div><b>{t('rpt.openRisksLbl')}</b> {risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
    </div><Narr text={learn.key_achievements} /></Section>
    <Section n="3" title={t('rpt.progressAgainst')}><table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.level')}</th><th>{t('rpt.statement')}</th></tr></thead><tbody>
      {d.frameworkNodes.filter((o) => o.project_id === projectId).sort((a,b) => (Number(a.sort_order)||0)-(Number(b.sort_order)||0) || String(a.node_code||'').localeCompare(String(b.node_code||''))).map((o) => <tr key={o.id}><td>{o.node_code || '—'}</td><td>{String(o.node_type || 'result').replaceAll('_',' ')}</td><td>{o.title}</td></tr>)}
    </tbody></table></Section>
    <Section n="4" title={t('rpt.indicatorPerformance')}><IndicatorResults d={d} indicators={inds} currentRows={prog} /></Section>
    <Section n="5" title={t('rpt.activityImplementation')}><table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.activity')}</th><th>{t('rpt.status')}</th><th>{t('rpt.progress')}</th><th>{t('rpt.plannedBudget')}</th><th>{t('rpt.actualExp')}</th></tr></thead><tbody>
      {acts.map((a) => <tr key={a.code}><td>{a.code}</td><td>{a.name}</td><td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td><td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td><td>{fmtAmount(a.planned_budget)}</td><td>{fmtAmount(a.actual_expenditure)}</td></tr>)}
      {acts.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noActivities')}</td></tr>}
    </tbody></table></Section>
    <Section n="6" title={t('rpt.financialPerformance')}><div className="rp-meta">
      <div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)}</div><div><b>{t('rpt.periodBudgetLbl')}</b> {fmtAmount(fin?.period_budget)}</div>
      <div><b>{t('rpt.expenditureThisPeriodLbl')}</b> {fmtAmount(fin?.expenditure_period)}</div><div><b>{t('rpt.cumulativeExpenditureLbl')}</b> {fmtAmount(exp)}</div>
      <div><b>{t('rpt.remainingBalanceLbl')}</b> {fmtAmount(fin?.remaining_balance ?? remainingBalance(budget, exp))}</div><div><b>{t('rpt.utilisationPctLbl')}</b> {fmtPct(fin?.utilisation_pct ?? utilisationPct(budget, exp))}</div>
    </div>{(!hasValue(budget) || !hasValue(exp)) && <p className="rp-muted">Financial values are incomplete. Blank values are not treated as zero.</p>}<Narr text={fin?.narrative} /></Section>
    <Section n="7" title="Area Council Coverage & Feasibility"><table className="rp-t"><thead><tr><th>{t('rpt.province')}</th><th>{t('rpt.areaCouncil')}</th><th>Coverage</th><th>Feasibility</th><th>Note</th></tr></thead><tbody>
      {locs.map((l) => <tr key={l.id}><td>{l.province_code || '—'}</td><td>{l.area_council_name || '—'}</td><td>{humanToken(l.coverage_status)}</td><td>{humanToken(l.feasibility_status)}</td><td>{l.feasibility_note || '—'}</td></tr>)}
      {locs.length === 0 && <tr><td colSpan={5} className="rp-muted">No Area Council coverage record has been entered. This is missing coverage data, not zero coverage.</td></tr>}
    </tbody></table></Section>
    <Section n="8" title={t('rpt.beneficiariesGedsi')}><table className="rp-t"><thead><tr><th>{t('rpt.period')}</th><th>{t('rpt.totalDirect')}</th><th>{t('rpt.female')}</th><th>{t('rpt.male')}</th><th>{t('rpt.youth')}</th><th>{t('rpt.pwd')}</th></tr></thead><tbody>
      {bens.map((b) => <tr key={b.id}><td>{b.reporting_period || '—'}</td><td>{b.total_direct ?? '—'}</td><td>{b.female ?? '—'}</td><td>{b.male ?? '—'}</td><td>{b.youth ?? '—'}</td><td>{b.persons_with_disability ?? '—'}</td></tr>)}
      {bens.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noBeneficiaryData')}</td></tr>}
    </tbody></table><p className="rp-muted">{t('rpt.blankCells')}</p></Section>
    <Section n="9" title={t('rpt.keyAchievements')}><Narr text={[learn.key_achievements, learn.major_results].filter(Boolean).join('\n\n')} /></Section>
    <Section n="10" title={t('rpt.challengesRisks')}><Narr text={learn.challenges} /><table className="rp-t"><thead><tr><th>{t('rpt.id')}</th><th>{t('rpt.type')}</th><th>{t('rpt.description')}</th><th>{t('rpt.rating')}</th><th>{t('rpt.status')}</th><th>{t('rpt.mitigation')}</th></tr></thead><tbody>
      {risks.map((r) => <tr key={r.code}><td>{r.code}</td><td>{OPT.labelOf(OPT.RISK_TYPE, r.type)}</td><td>{r.description}</td><td>{r.risk_rating || '—'}</td><td>{OPT.labelOf(OPT.RISK_STATUS, r.status)}</td><td>{r.mitigation || '—'}</td></tr>)}
      {risks.length === 0 && <tr><td colSpan={6} className="rp-muted">No risks or issues have been recorded. Risk status is unassessed rather than automatically low.</td></tr>}
    </tbody></table></Section>
    <Section n="11" title={t('rpt.lessonsLearned')}><Narr text={learn.lessons_learned} /></Section><Section n="12" title={t('rpt.nextPeriodPriorities')}><Narr text={learn.next_period_priorities} /></Section><Section n="13" title={t('rpt.recommendations')}><Narr text={learn.recommendations} /></Section><Section n="14" title={t('rpt.supportingEvidence')}><ReportEvidence d={d} rows={d.evidence.filter(row => row.project_id === projectId && inScope(row))} /></Section><ReportActions activities={acts} />
  </div>;
}

function Portfolio({ d, period, periodType }) {
  const { t } = useTranslation();
  const inScope = (row) => rowMatchesPeriodScope(row, d.reporting, period, periodType);
  const fin = latestByProject(d.financial.filter(inScope));
  const budgets = d.projects.map((p) => projectBudgetValue(p, fin.get(p.id)));
  const expenditures = d.projects.map((p) => projectExpenditureValue(p, fin.get(p.id), period));
  const budget = sumKnown(budgets);
  const exp = sumKnown(expenditures);
  const beneficiaries = portfolioBeneficiaries(d.beneficiaries.filter(inScope));
  return <div><h2>{t('rpt.portfolioPerformanceReport')}</h2><div className="rp-muted">All projects{period ? ` · ${period}` : ''}</div>
    <Section n="1" title={t('rpt.portfolioSummary')}><div className="rp-meta">
      <div><b>{t('rpt.projectsLbl')}</b> {d.projects.length}</div><div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)}</div><div><b>{t('rpt.expenditureLbl')}</b> {fmtAmount(exp)}</div><div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div><div><b>{t('rpt.totalBeneficiariesLbl')}</b> {fmtNum(beneficiaries)}</div><div><b>{t('rpt.openRisksLbl')}</b> {d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
    </div>{(!hasValue(budget) || !hasValue(exp)) && <p className="rp-muted">Portfolio financial totals are withheld when one or more included projects have not reported the required value. Missing values are not treated as zero.</p>}</Section>
    <Section n="2" title={t('rpt.projects')}><table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.status')}</th><th>{t('rpt.donor')}</th><th>{t('rpt.budget')}</th><th>{t('rpt.expenditure')}</th><th>{t('rpt.utilisation')}</th></tr></thead><tbody>
      {d.projects.map((p) => { const f = fin.get(p.id); const b = projectBudgetValue(p, f); const e = projectExpenditureValue(p, f, period); return <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</td><td>{p.donor || '—'}</td><td>{fmtAmount(b)}</td><td>{fmtAmount(e)}</td><td>{fmtPct(utilisationPct(b, e))}</td></tr>; })}
    </tbody></table></Section></div>;
}

function IndicatorReport({ d, period, periodType }) {
  const { t } = useTranslation();
  const rows = d.progress.filter(r => rowMatchesPeriodScope(r, d.reporting, period, periodType));
  return <div><h2>{t('rpt.indicatorPerformanceReport')}</h2><p className="rp-muted">{period || `All ${PERIOD_TYPES.find(x => x.value === periodType)?.label.toLowerCase() || ''} periods`}</p><IndicatorResults d={d} indicators={d.indicators} currentRows={rows} /></div>;
}

function FinancialReport({ d, period, periodType }) {
  const { t } = useTranslation();
  const inScope = (row) => rowMatchesPeriodScope(row, d.reporting, period, periodType);
  const fin = latestByProject(d.financial.filter(inScope));
  const rows = d.projects.map((p) => { const f = fin.get(p.id); const b = projectBudgetValue(p, f); const e = projectExpenditureValue(p, f, period); return { p, b, e, avail: f?.funds_available }; });
  const tb = sumKnown(rows.map((row) => row.b));
  const te = sumKnown(rows.map((row) => row.e));
  return <div><h2>{t('rpt.financialPerformanceReport')}</h2><div className="rp-meta"><div><b>{t('rpt.totalApprovedLbl')}</b> {fmtAmount(tb)}</div><div><b>{t('rpt.totalExpenditureLbl')}</b> {fmtAmount(te)}</div><div><b>{t('rpt.remainingLbl')}</b> {fmtAmount(remainingBalance(tb, te))}</div><div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(tb, te))}</div></div>
    {(!hasValue(tb) || !hasValue(te)) && <p className="rp-muted">Portfolio financial totals are unavailable until all included projects report the required values. Missing values are not treated as zero.</p>}
    <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.approved')}</th><th>{t('rpt.expenditure')}</th><th>{t('rpt.remaining')}</th><th>{t('rpt.utilisation')}</th><th>{t('rpt.fundsAvailable')}</th></tr></thead><tbody>
      {rows.map(({ p, b, e, avail }) => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{fmtAmount(b)}</td><td>{fmtAmount(e)}</td><td>{fmtAmount(remainingBalance(b, e))}</td><td>{fmtPct(utilisationPct(b, e))}</td><td>{fmtAmount(avail)}</td></tr>)}
    </tbody></table></div>;
}

function GeographicReport({ d, province }) {
  const { t } = useTranslation();
  const areas = province ? d.areaCouncils.filter((l) => l.province_code === province) : d.areaCouncils;
  const projectIds = new Set(areas.map((l) => l.project_id));
  const projs = d.projects.filter((p) => projectIds.has(p.id) || (province && (p.provinces || []).includes(province)));
  const covered = areas.filter((a) => a.coverage_status !== 'not_covered');
  const confirmed = areas.filter((a) => a.feasibility_status === 'confirmed');
  const projectsWithCoverage = new Set(areas.map((a) => a.project_id)).size;
  return <div><h2>{province ? `${province} Province` : 'Area Council Coverage'} Report</h2><Section n="1" title={t('rpt.coverageSummary')}><div className="rp-meta"><div><b>{t('rpt.projectsLbl')}</b> {projs.length}</div><div><b>Projects with coverage records</b> {projectsWithCoverage}</div><div><b>Area Councils covered</b> {new Set(covered.map((a) => a.area_council_name)).size}</div><div><b>Feasibility confirmed</b> {confirmed.length}</div></div>
    {projs.length > projectsWithCoverage && <p className="rp-muted">{projs.length - projectsWithCoverage} project{projs.length - projectsWithCoverage === 1 ? '' : 's'} in this scope have no Area Council coverage record. That is missing geographic data, not zero coverage.</p>}</Section>
    <Section n="2" title="Area Councils"><table className="rp-t"><thead><tr><th>{t('rpt.province')}</th><th>{t('rpt.areaCouncil')}</th><th>Coverage</th><th>Feasibility</th><th>Note</th></tr></thead><tbody>{areas.map((a) => <tr key={a.id}><td>{a.province_code || '—'}</td><td>{a.area_council_name || '—'}</td><td>{humanToken(a.coverage_status)}</td><td>{humanToken(a.feasibility_status)}</td><td>{a.feasibility_note || '—'}</td></tr>)}{areas.length === 0 && <tr><td colSpan={5} className="rp-muted">No Area Council coverage records have been entered for this scope.</td></tr>}</tbody></table></Section></div>;
}

function DonorReport({ d, donor, period, periodType }) {
  const { t } = useTranslation();
  const donorProjectIds = donor ? new Set(d.organizations.filter((o) => o.name === donor && ['donor','co_financier'].includes(o.role)).map((o) => o.project_id)) : null;
  const projs = donor ? d.projects.filter((p) => p.donor === donor || donorProjectIds.has(p.id)) : d.projects;
  const inScope = (row) => rowMatchesPeriodScope(row, d.reporting, period, periodType);
  const fin = latestByProject(d.financial.filter(inScope));
  const ids = new Set(projs.map((p) => p.id));
  const budget = sumKnown(projs.map((p) => projectBudgetValue(p, fin.get(p.id))));
  const exp = sumKnown(projs.map((p) => projectExpenditureValue(p, fin.get(p.id), period)));
  const bens = portfolioBeneficiaries(d.beneficiaries.filter((b) => ids.has(b.project_id) && inScope(b)));
  return <div><h2>{donor || 'All Donors'} — Funding Partner Report</h2><Section n="1" title={t('rpt.investmentSummary')}><div className="rp-meta"><div><b>{t('rpt.projectsLbl')}</b> {projs.length}</div><div><b>{t('rpt.investmentLbl')}</b> {fmtAmount(budget)}</div><div><b>{t('rpt.expenditureLbl')}</b> {fmtAmount(exp)}</div><div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div><div><b>{t('rpt.beneficiariesLbl')}</b> {fmtNum(bens)}</div></div>{(!hasValue(budget) || !hasValue(exp)) && <p className="rp-muted">Funding-partner totals are withheld when one or more included projects have not reported the required financial value.</p>}</Section>
    <Section n="2" title={t('rpt.projects')}><table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.status')}</th><th>{t('rpt.budget')}</th><th>{t('rpt.expenditure')}</th></tr></thead><tbody>{projs.map((p) => { const f = fin.get(p.id); return <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</td><td>{fmtAmount(projectBudgetValue(p, f))}</td><td>{fmtAmount(projectExpenditureValue(p, f, period))}</td></tr>; })}</tbody></table></Section></div>;
}
