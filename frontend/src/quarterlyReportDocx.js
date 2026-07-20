// Renders a quarterly-report object (from buildQuarterlyReport) to a Word
// .docx Blob using the `docx` library. Kept separate so it can be lazily
// imported — the library only loads when a user exports to Word.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
} from 'docx';
import { STATUS_KEY_LABEL } from './quarterlyReport';
import { renderFigureSvg, svgToPngBytes, svgDims } from './reportCharts';

const GREEN = '0E6E6E';
const INK   = '1A1712';
const MUTED = '6B6258';
const ZEBRA = 'F1F6F1';
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
      // Zebra striping on odd body rows so tables read as human-authored.
      ...rows.map((r, i) => new TableRow({ children: r.map(c => {
        const z = i % 2 ? ZEBRA : undefined;
        return (c && typeof c === 'object' && 'text' in c)
          ? cell(c.text, { fill: z, ...c })
          : cell(c, { fill: z });
      }) })),
    ],
  });
}

// Shaded "Summary" callout paragraph placed under a table or figure.
const summaryPara = text => new Paragraph({
  spacing: { before: 60, after: 160 },
  shading: { fill: 'EAF3EC' },
  children: [
    new TextRun({ text: 'Summary  ', bold: true, size: 15, color: GREEN }),
    new TextRun({ text, size: 18, color: INK, italics: true }),
  ],
});

// Load a photo URL into PNG bytes + scaled dimensions for embedding in the
// document. Re-encodes through a canvas so large uploads are downsized and the
// format is one Word accepts. Returns null on failure (CORS / network / decode)
// so a bad photo is skipped rather than failing the whole export.
async function loadPhotoPng(url, maxW = 460) {
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const nw = img.naturalWidth || maxW;
    const nh = img.naturalHeight || Math.round(maxW * 0.75);
    const scale = nw > maxW ? maxW / nw : 1;
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const bytes = await new Promise((res, rej) => canvas.toBlob(
      b => b ? b.arrayBuffer().then(ab => res(new Uint8Array(ab))).catch(rej) : rej(new Error('toBlob failed')),
      'image/png',
    ));
    return { bytes, width: w, height: h };
  } catch {
    return null;
  }
}

// Photo block: embedded photograph + caption + activity reference.
function photoParagraphs(photo, png) {
  const out = [
    new Paragraph({
      spacing: { before: 80, after: 20 }, alignment: AlignmentType.LEFT,
      children: [new ImageRun({ data: png.bytes, transformation: { width: png.width, height: png.height } })],
    }),
    new Paragraph({ spacing: { after: photo.activity && photo.activity !== photo.caption ? 20 : 160 },
      children: [new TextRun({ text: photo.caption, bold: true, size: 16, color: MUTED })] }),
  ];
  if (photo.activity && photo.activity !== photo.caption) {
    out.push(new Paragraph({ spacing: { after: 160 },
      children: [new TextRun({ text: photo.activity, size: 15, color: MUTED, italics: true })] }));
  }
  return out;
}

// Figure block: embedded chart image + caption + one-line interpretation.
function figureParagraphs(fig, png) {
  const maxW = 520;
  const scale = png.width > maxW ? maxW / png.width : 1;
  return [
    new Paragraph({
      spacing: { before: 80, after: 20 }, alignment: AlignmentType.LEFT,
      children: [new ImageRun({ data: png.bytes, transformation: { width: Math.round(png.width * scale), height: Math.round(png.height * scale) } })],
    }),
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: fig.caption, bold: true, size: 15, color: MUTED })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: fig.summary, size: 16, color: MUTED, italics: true })] }),
  ];
}

export async function buildQuarterlyDocxBlob(report) {
  const { meta } = report;
  const children = [];

  // Pre-rasterise every figure's SVG to PNG bytes (async, browser canvas).
  const pngById = {};
  for (const fig of (report.figures || [])) {
    const svg = renderFigureSvg(fig);
    const { width, height } = svgDims(svg);
    try {
      const bytes = await svgToPngBytes(svg, width, height, 2);
      pngById[fig.id] = { bytes, width, height };
    } catch { /* skip a figure that fails to rasterise rather than fail export */ }
  }
  const figuresFor = section => (report.figures || [])
    .filter(f => f.section === section && pngById[f.id])
    .flatMap(f => figureParagraphs(f, pngById[f.id]));

  // Pre-load activity photos (async fetch + canvas re-encode); failures skipped.
  const photoPngs = [];
  for (const photo of (report.photos || [])) {
    const png = await loadPhotoPng(photo.url);
    if (png) photoPngs.push({ photo, png });
  }

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
    children: [new TextRun({ text: `Prepared by: ${meta.preparedBy}  ·  Generated: ${meta.dateGenerated}${meta.dataSource ? `  ·  ${meta.dataSource}` : ''}`, size: 16, color: MUTED })],
  }));
  if (meta.docRef) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Document Ref: ${meta.docRef}`, size: 16, color: MUTED })],
    }));
  }

  // ── Back to Office Report — mission layout ──
  if (meta.kind === 'btor') {
    const m = report.btorMeta || {};
    const missionDates = `${m.dateFrom || '—'}${m.dateTo && m.dateTo !== m.dateFrom ? ` – ${m.dateTo}` : ''}`;
    children.push(heading('1. Mission Details'));
    children.push(table(['Field', 'Detail'], [
      [{ text: 'Officer(s)', bold: true }, (m.officers || []).join(', ') || '—'],
      [{ text: 'Designation / unit', bold: true }, m.designation || '—'],
      [{ text: 'Mission dates', bold: true }, missionDates],
      [{ text: 'Destination(s)', bold: true }, (m.destinations || []).join(', ') || '—'],
      [{ text: 'Reporting period', bold: true }, meta.period],
    ], [2800, 7200]));
    children.push(heading('2. Purpose & Objectives'));
    children.push(para(m.purpose || '', { size: 20 }));
    children.push(heading('3. Activities Conducted'));
    children.push(table(
      ['Date', 'Activity', 'Project / Location', 'Officer', 'Source'],
      report.btor.map(b => [b.date, b.activity, b.location, b.officer, b.output]),
      [1400, 4000, 1900, 1700, 1000],
    ));
    children.push(summaryPara(report.summaries.btor));
    children.push(heading('4. Key Findings & Outcomes'));
    children.push(para(m.findings || '', { size: 20 }));
    (report.keyAchievements || []).slice(0, 6).forEach(a => children.push(para(`•  ${a.title} — ${a.detail}`, { size: 18 })));
    children.push(heading('5. Stakeholders Engaged'));
    children.push(para(m.stakeholders || '', { size: 20 }));
    children.push(heading('6. Challenges & Limitations'));
    report.challenges.narrative.forEach(t => children.push(para(t, { size: 20 })));
    if (report.challenges.rows.length) {
      children.push(table(
        ['Category', 'Challenge', 'Impact', 'Mitigation'],
        report.challenges.rows.map(c => [c.category, c.description, c.impact, c.mitigation]),
        [1800, 3800, 2200, 2200],
      ));
    }
    children.push(heading('7. Follow-up Actions'));
    if ((m.followUp || []).length) m.followUp.forEach((f, i) => children.push(para(`${i + 1}.  ${f}`, { size: 20 })));
    else children.push(para('No outstanding follow-up actions for this mission.', { size: 20 }));
    if (photoPngs.length) {
      children.push(heading('8. Photo Documentation'));
      photoPngs.forEach(({ photo, png }) => photoParagraphs(photo, png).forEach(pp => children.push(pp)));
    }
  } else {

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
  children.push(summaryPara(report.summaries.activityOverview));
  figuresFor('overview').forEach(pp => children.push(pp));

  // ── Quarterly accomplishment ──
  children.push(heading(`${report.meta.period} — Progress & Accomplishment`));
  children.push(table(
    ['Activity / Programme', 'Theme / Focus Area', 'Output / Result', 'Means of Verification', 'Status'],
    report.accomplishments.map(a => [
      a.activity,
      a.focusArea ? `${a.theme} · ${a.focusArea}` : a.theme,
      a.output, a.mov,
      { text: STATUS_KEY_LABEL[a.statusKey], fill: STATUS_FILL[a.statusKey], bold: true },
    ]),
    [2900, 2200, 2900, 2200, 1400],
  ));
  children.push(para('Status key:  Completed / On track   ·   Ongoing   ·   Delayed   ·   Not started', { size: 16, color: MUTED }));
  children.push(summaryPara(report.summaries.accomplishments));

  // ── Budget utilisation ──
  children.push(subheading('Budget Utilisation'));
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
  children.push(summaryPara(report.summaries.budget));
  figuresFor('budget').forEach(pp => children.push(pp));

  // ── Challenges ──
  children.push(heading('Challenges and Limitations'));
  report.challenges.narrative.forEach(t => children.push(para(t, { size: 20 })));
  if (report.challenges.rows.length) {
    children.push(table(
      ['Category', 'Description', 'Impact', 'Mitigation Action', 'Quantitative Impact'],
      report.challenges.rows.map(c => [c.category, c.description, c.impact, c.mitigation, c.quantitative]),
      [1500, 3000, 2000, 2600, 1900],
    ));
    children.push(summaryPara(report.summaries.challenges));
  }

  // ── Activities conducted [BTOR] ──
  children.push(subheading('Activities Conducted [BTOR]'));
  children.push(table(
    ['Period', 'Activity', 'Location', 'Responsible Officer', 'Output / Result'],
    report.btor.map(b => [b.date, b.activity, b.location, b.officer, b.output]),
    [1200, 3600, 1900, 1900, 2400],
  ));
  children.push(summaryPara(report.summaries.btor));

  // ── Lessons learned ──
  children.push(subheading('Lessons Learned'));
  children.push(table(
    ['Lesson', 'Improvement Action', 'Responsible Unit', 'Quantitative Measure'],
    report.lessons.map(l => [l.lesson, l.improvement, l.unit, l.measure]),
    [3200, 3400, 1900, 2500],
  ));

  // ── Next steps ──
  children.push(subheading('Next Steps'));
  children.push(table(
    ['Plan Activity', 'Expected Outcome', 'Timeline', 'Lead Officer', 'Target / Metric'],
    report.nextSteps.map(n => [n.activity, n.outcome, n.timeline, n.lead, n.target]),
    [3400, 3200, 1500, 1400, 1500],
  ));
  children.push(summaryPara(report.summaries.nextSteps));

  // ── Activity reports ──
  if ((report.reports || []).length) {
    children.push(heading('Activity Reports'));
    children.push(para('Automatic summaries of narrative reports uploaded against activities this period.', { size: 20 }));
    report.reports.forEach(r => {
      children.push(new Paragraph({
        spacing: { before: 80, after: 20 },
        children: [
          new TextRun({ text: r.fileName, bold: true, size: 19, color: INK }),
          ...(r.activity ? [new TextRun({ text: `  — ${r.activity}`, size: 16, color: MUTED })] : []),
        ],
      }));
      children.push(para(r.summary, { size: 18, color: MUTED }));
    });
    if (report.summaries.reports) children.push(summaryPara(report.summaries.reports));
  }

  // ── Photo documentation ──
  if (photoPngs.length) {
    children.push(heading('Photo Documentation'));
    children.push(para('Field photographs uploaded against Strategic Results Framework activities during this reporting period.', { size: 20 }));
    photoPngs.forEach(({ photo, png }) => photoParagraphs(photo, png).forEach(pp => children.push(pp)));
    if (report.summaries.photos) children.push(summaryPara(report.summaries.photos));
  }

  // ── Supporting attachments ──
  children.push(heading('Supporting Attachments'));
  children.push(para('The following annexes and figures support the findings in this report. Figures 1–4 are embedded inline in the relevant sections above.', { size: 20 }));
  children.push(table(
    ['Reference', 'Attachment', 'Description'],
    [
      ...report.attachments.map(a => [{ text: a.ref, bold: true }, a.title, a.note]),
      ...(report.figures || []).map(f => [{ text: `Figure ${f.num}`, bold: true }, f.title, f.summary]),
    ],
    [1600, 3600, 4800],
  ));

  } // end standard (non-BTOR) body

  // ── Approval & sign-off ──
  if (report.signoff) {
    children.push(heading(`Approval & Sign-off${report.signoff.date ? ` · ${report.signoff.date}` : ''}`));
    report.signoff.roles.forEach(role => {
      children.push(new Paragraph({ spacing: { before: 160, after: 20 }, children: [new TextRun({ text: role.role, bold: true, size: 18, color: GREEN })] }));
      children.push(para(role.name || '________________________', { size: 20 }));
      if (role.title) children.push(para(role.title, { size: 16, color: MUTED, italics: true }));
      children.push(para('Signature: ______________________     Date: ____________', { size: 16, color: MUTED }));
    });
  }

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
