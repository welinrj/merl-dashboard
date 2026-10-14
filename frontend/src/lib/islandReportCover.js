import { ImageRun, TextRun, Paragraph, PageBreak, AlignmentType } from 'docx';
import logo from '../assets/island-resilience.png';
let logoBytes;
async function imageBytes() {
  if (!logoBytes) {
    const response = await fetch(logo);
    if (!response.ok) throw new Error('The report logo could not be loaded. Please try again.');
    logoBytes = new Uint8Array(await response.arrayBuffer());
  }
  return logoBytes;
}
export async function wordCover({ title, period, project, generated, dataAsAt, status }) {
  const data = await imageBytes();
  const text = (value, size, bold = false, before = 240) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before, after: 180 }, children: [{ text: value, size, bold, color: '153B58' }].map(value => new TextRun(value)) });
  return [
    new Paragraph({ children: [new ImageRun({ data, transformation: { width: 90, height: 84 } })], spacing: { after: 360 } }),
    text('MERL PORTAL', 30, true),
    text('Department of Climate Change · Vanuatu', 22),
    text(title, 44, true, 600), text(period, 30, true),
    ...(project ? [text(project, 26)] : []),
    text(status || '', 22, true),
    text(`Generated: ${generated}`, 20), text(`Data as at: ${dataAsAt || 'Not reported'}`, 20),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 200 }, children: [new ImageRun({ data, transformation: { width: 170, height: 158 } })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}
export async function pdfCover(pdf, { title, period, project, generated, dataAsAt, status }) {
  const bytes = await imageBytes();
  const family = pdf.getFontList().ReportSans ? 'ReportSans' : 'helvetica';
  pdf.setTextColor('#153B58'); pdf.addImage(bytes, 'PNG', 42, 42, 65, 61);
  pdf.setFont(family, 'bold'); pdf.setFontSize(20); pdf.text('MERL PORTAL', 124, 73);
  pdf.setFont(family, 'normal'); pdf.setFontSize(11); pdf.text('Department of Climate Change · Vanuatu', 42, 136);
  pdf.setFont(family, 'bold'); pdf.setFontSize(30);
  const lines = pdf.splitTextToSize(title, 510); pdf.text(lines, 42, 220);
  let y = 230 + lines.length * 35;
  pdf.setFontSize(17); pdf.text(pdf.splitTextToSize(period, 510), 42, y); y += 48;
  pdf.setFont(family, 'normal'); pdf.setFontSize(12);
  if (project) { const p = pdf.splitTextToSize(project, 510); pdf.text(p, 42, y); y += p.length * 17 + 25; }
  pdf.setFontSize(10); pdf.text(status || '', 42, y); y += 24; pdf.text(`Generated: ${generated}`, 42, y); pdf.text(`Data as at: ${dataAsAt || 'Not reported'}`, 42, y + 18);
  pdf.setFillColor('#E5F4F5'); pdf.rect(0, 710, 595.28, 132, 'F');
  pdf.setFillColor('#008E9B'); pdf.rect(0, 825, 595.28, 17, 'F');
  pdf.addImage(bytes, 'PNG', 300, 575, 225, 210);
  pdf.addPage(); pdf.setTextColor('#1A1A1A');
}
