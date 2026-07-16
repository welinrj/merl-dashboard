// Renders a quarterly-report object (from buildQuarterlyReport) to a Word
// .docx Blob using the `docx` library. Kept separate so it can be lazily
// imported — the library only loads when a user exports to Word.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import { fmtVUV, STATUS_KEY_LABEL } from './quarterlyReport';

const GREEN = '0E6E6E';
const INK   = '1A1712';
const MUTED = '6B6258';
const STATUS_FILL = { green: 'DCECE2', amber: 'F7EAD0', red: 'F6DED8', none: 'ECE9E3' };

const para = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  children: [new TextRun({ text, ...opts })],
});

const heading = text => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, bold: true, color: GREEN, size: 28 })],
});

const subheading = text => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 160, after: 80 },
  children: [new TextRun({ text, bold: true, color: INK, size: 24 })],
});

const cell = (text, { header = false, fill, bold = false, align } = {}) => new TableCell({
  shading: fill ? { fill } : (header ? { fill: 'DCECE2' } : undefined),
  margins: { top: 40, bottom: 40, left: 80, right: 80 },
  children: [new Paragraph({
    alignment: align,
    children: [new TextRun({
      text: text == null ? '' : String(text),
      bold: bold || header, size: header ? 17 : 18, color: header ? GREEN : INK,
    })],
  })],
});

function table(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D8D2C8' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(h => cell(h, { header: true })) }),
      ...rows.map(r => new TableRow({ children: r.map(c =>
        (c && typeof c === 'object' && 'text' in c) ? cell(c.text, c) : cell(c)) })),
    ],
  });
}

export async function buildQuarterlyDocxBlob(report) {
  const { meta } = report;
  const children = [];

  // ── Cover ──
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: meta.title, bold: true, size: 48, color: GREEN })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: meta.subtitle, size: 22, color: INK })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: meta.months, size: 20, color: MUTED, italics: true })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: `Prepared by: ${meta.preparedBy}  ·  Generated: ${meta.dateGenerated}`, size: 16, color: MUTED })],
  }));

  // ── Executive summary ──
  children.push(heading('Executive Summary'));
  report.executiveSummary.forEach(t => children.push(para(t, { size: 20 })));

  // ── Key achievements ──
  children.push(heading('Key Achievements'));
  report.keyAchievements.forEach(a => {
    children.push(new Paragraph({
      bullet: { level: 0 }, spacing: { after: 60 },
      children: [
        new TextRun({ text: a.title, bold: true, size: 20, color: INK }),
        new TextRun({ text: `  — ${a.detail}`, size: 18, color: MUTED }),
      ],
    }));
  });

  // ── Introduction ──
  children.push(heading('Introduction'));
  report.introduction.forEach(t => children.push(para(t, { size: 20 })));

  // ── Activity overview ──
  children.push(heading('Activity Overview'));
  children.push(table(
    ['Strategic Theme', 'Activities', 'On Track', 'Ongoing', 'Delayed', 'Budget (VUV)'],
    report.activityOverview.map(t => [
      t.theme, String(t.total), String(t.green), String(t.amber), String(t.red),
      (t.budget).toLocaleString('en-US'),
    ]),
    [2600, 1100, 1100, 1100, 1100, 2000],
  ));

  // ── Quarterly accomplishment ──
  children.push(heading(`${report.meta.period} — Progress Towards Quarterly Accomplishment`));
  children.push(table(
    ['Strategic Priority', 'Activity / Programme', 'Building Block', 'Partner', 'Output Status'],
    report.accomplishments.map(a => [
      a.priority, a.activity, a.buildingBlock, a.partner,
      { text: STATUS_KEY_LABEL[a.statusKey], fill: STATUS_FILL[a.statusKey], bold: true },
    ]),
    [1800, 3400, 2200, 1600, 1600],
  ));
  children.push(para('Progress Status:  🟢 Completed / On track   🟡 Ongoing   🔴 Delayed', { size: 16, color: MUTED }));

  // ── Budget utilisation ──
  children.push(subheading('💰 Budget Utilisation'));
  children.push(table(
    ['Component', 'Planned (VUV)', 'Actual (VUV)', 'Variance (VUV)', '% Utilised', 'Status'],
    [
      ...report.budget.rows.map(r => [
        r.component, r.planned.toLocaleString('en-US'), r.actual.toLocaleString('en-US'),
        r.variance.toLocaleString('en-US'), `${r.pctUtil}%`,
        { text: STATUS_KEY_LABEL[r.statusKey], fill: STATUS_FILL[r.statusKey], bold: true },
      ]),
      [
        { text: 'TOTAL', bold: true },
        { text: report.budget.totals.planned.toLocaleString('en-US'), bold: true },
        { text: report.budget.totals.actual.toLocaleString('en-US'), bold: true },
        { text: report.budget.totals.variance.toLocaleString('en-US'), bold: true },
        { text: `${report.budget.totals.pctUtil}%`, bold: true },
        '',
      ],
    ],
    [2600, 1700, 1700, 1700, 1200, 1300],
  ));
  if (!report.budget.live) {
    children.push(para('Note: planned budgets shown by theme; actual expenditure will populate from the finance data source when connected.', { size: 15, color: MUTED, italics: true }));
  }

  // ── Challenges ──
  children.push(heading('Challenges and Limitations'));
  report.challenges.narrative.forEach(t => children.push(para(t, { size: 20 })));
  if (report.challenges.rows.length) {
    children.push(table(
      ['Category', 'Description', 'Impact', 'Mitigation Action', 'Quantitative Impact'],
      report.challenges.rows.map(c => [c.category, c.description, c.impact, c.mitigation, c.quantitative]),
      [1500, 3000, 2000, 2600, 1900],
    ));
  }

  // ── Activities conducted [BTOR] ──
  children.push(subheading('📌 Activities Conducted [BTOR]'));
  children.push(table(
    ['Period', 'Activity', 'Location', 'Responsible Officer', 'Output / Result'],
    report.btor.map(b => [b.date, b.activity, b.location, b.officer, b.output]),
    [1200, 3600, 1900, 1900, 2400],
  ));

  // ── Lessons learned ──
  children.push(subheading('💡 Lessons Learned'));
  children.push(table(
    ['Lesson', 'Improvement Action', 'Responsible Unit', 'Quantitative Measure'],
    report.lessons.map(l => [l.lesson, l.improvement, l.unit, l.measure]),
    [3200, 3400, 1900, 2500],
  ));

  // ── Next steps ──
  children.push(subheading('🚀 Next Steps'));
  children.push(table(
    ['Plan Activity', 'Expected Outcome', 'Timeline', 'Lead Officer', 'Target / Metric'],
    report.nextSteps.map(n => [n.activity, n.outcome, n.timeline, n.lead, n.target]),
    [3400, 3200, 1500, 1400, 1500],
  ));

  // ── Footer ──
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 320 },
    children: [new TextRun({ text: 'Department of Climate Change · Government of Vanuatu · www.docc.gov.vu', size: 16, color: MUTED })],
  }));

  const doc = new Document({
    creator: 'DoCC MERL Dashboard',
    title: meta.title,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
}
