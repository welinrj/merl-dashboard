// A4 tables with wrapping, repeated headings and row continuation. Body text is
// paginated line by line, including narratives longer than a whole page.
export function renderReportPdf(pdf, blocks, { title = '', status = '' } = {}) {
  const margin = 42, pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - margin * 2, bottom = pdf.internal.pageSize.getHeight() - 48;
  let y = 52;
  const clean = text => String(text ?? '—').replaceAll('→', ' to ').replaceAll('—', '-').replaceAll('–', '-').replaceAll('’', "'").replaceAll('≥', '>=').replaceAll('≤', '<=');
  const nextPage = () => { pdf.addPage(); y = 52; };
  const write = (text, size = 9, bold = false, gap = 7) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(clean(text), width)) {
      if (y + size + 3 > bottom) nextPage();
      pdf.text(line, margin, y); y += size + 3;
    }
    y += gap;
  };
  const table = block => {
    const columns = Math.max(...block.rows.map(row => row.length));
    const weights = Array.from({ length: columns }, (_, i) => Math.max(9, Math.min(38,
      Math.max(...block.rows.map(row => String(row[i] || '').length)) ** .65 * 4)));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map(weight => width * weight / total);
    const lineHeight = 10, padding = 5;
    const wrap = row => row.map((cell, index) => pdf.splitTextToSize(clean(cell || '—'), widths[index] - padding * 2));
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    const header = wrap(block.rows[0]);
    const headerHeight = Math.max(...header.map(lines => lines.length)) * lineHeight + padding * 2;
    const draw = (cells, lineCount, isHeader) => {
      const height = lineCount * lineHeight + padding * 2;
      let x = margin;
      pdf.setFont('helvetica', isHeader ? 'bold' : 'normal'); pdf.setFontSize(7.5);
      pdf.setDrawColor('#D6E0E5'); pdf.setFillColor(isHeader ? '#EAF2F6' : '#FFFFFF');
      for (let i = 0; i < columns; i++) {
        pdf.rect(x, y - 7, widths[i], height, 'FD');
        pdf.text(cells[i] || [], x + padding, y + padding);
        x += widths[i];
      }
      y += height;
    };
    const repeatHeader = () => draw(header, (headerHeight - padding * 2) / lineHeight, true);
    if (y + headerHeight + 30 > bottom) nextPage();
    repeatHeader();
    for (const row of block.rows.slice(1)) {
      pdf.setFont('helvetica', 'normal');
      const cells = wrap(row);
      const count = Math.max(...cells.map(lines => lines.length));
      const height = count * lineHeight + padding * 2;
      if (y + height > bottom && height <= bottom - 52 - headerHeight) { nextPage(); repeatHeader(); }
      let offset = 0;
      while (offset < count) {
        const available = Math.floor((bottom - y - padding * 2) / lineHeight);
        if (available < 1) { nextPage(); repeatHeader(); continue; }
        const lines = Math.min(available, count - offset);
        draw(cells.map(cell => cell.slice(offset, offset + lines)), lines, false);
        offset += lines;
        if (offset < count) { nextPage(); repeatHeader(); }
      }
    }
    y += 13;
  };
  for (const block of blocks) {
    if (block.type === 'pageBreak') { if (y > 52) nextPage(); continue; }
    if (block.type === 'table') { if (block.rows.length) table(block); continue; }
    const heading = ['title', 'heading1', 'heading2'].includes(block.type);
    if (heading && y + 60 > bottom) nextPage();
    write(block.text, block.type === 'title' ? 17 : block.type === 'heading1' ? 13 : block.type === 'heading2' ? 10.5 : 9, heading);
  }
  const pages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor('#536577');
    if (page > 1) pdf.text(pdf.splitTextToSize(clean(title), width)[0] || 'MERL Portal', margin, 27);
    pdf.text(`${clean(status)} · ${page} / ${pages}`, margin, pdf.internal.pageSize.getHeight() - 24);
  }
}
