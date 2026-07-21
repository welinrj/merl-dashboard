// Minimal .xlsx (SpreadsheetML) writer built on JSZip — replaces SheetJS for the
// app's data exports, which only need plain string/number cells across a few
// named sheets. Strings are emitted as inline strings, so no shared-string
// table or styles part is required. JSZip is already a dependency (used to read
// docx/xlsx), so this adds no new packages.

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// 0-based column index -> spreadsheet column letters (0 -> A, 26 -> AA).
function colRef(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function worksheetXml(rows) {
  const body = rows.map((cells, ri) => {
    const cs = cells.map((val, ci) => {
      const ref = `${colRef(ci)}${ri + 1}`;
      if (val == null || val === '') return '';
      if (typeof val === 'number' && Number.isFinite(val)) {
        return `<c r="${ref}"><v>${val}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${body}</sheetData></worksheet>`;
}

// Excel sheet-name rules: <= 31 chars, none of []:*?/\.
const safeSheetName = (name, i) =>
  (String(name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)) || `Sheet${i + 1}`;

/**
 * Build a workbook blob.
 * @param {{name:string, rows:(string|number|null)[][]}[]} sheets
 * @returns {Promise<Blob>}
 */
export async function buildXlsxBlob(sheets) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`;
  zip.file('[Content_Types].xml', contentTypes);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`);

  const sheetTags = sheets.map((s, i) => `<sheet name="${escapeXml(safeSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${sheetTags}</sheets></workbook>`);

  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);

  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(s.rows)));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
