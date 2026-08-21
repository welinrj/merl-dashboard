// =============================================================================
// parseTabular — read a CSV or XLSX file into { columns, rows } for the
// Datasets ingestion mapping UI. CSV uses PapaParse; XLSX is unzipped with
// JSZip and parsed from the first worksheet (shared strings resolved, cell
// gaps filled by column reference so columns stay aligned).
// =============================================================================
import Papa from 'papaparse';

export function isTabular(fileName = '') {
  const n = fileName.toLowerCase();
  return n.endsWith('.csv') || n.endsWith('.xlsx');
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}

// "A" → 0, "B" → 1, "AA" → 26 …
function colToIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || [''])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function parseCsv(file) {
  const text = await file.text();
  const { data, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim(),
  });
  const columns = (meta.fields || []).filter(Boolean);
  return { columns, rows: data.filter(r => Object.values(r).some(v => String(v ?? '').trim() !== '')) };
}

async function readSharedStrings(zip) {
  const f = zip.file('xl/sharedStrings.xml');
  if (!f) return [];
  const xml = await f.async('string');
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let s = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(m[1]))) s += t[1];
    out.push(decodeXml(s));
  }
  return out;
}

async function parseXlsx(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const shared = await readSharedStrings(zip);

  // First worksheet by part name (sheet1 is the conventional first).
  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ||
    zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
  if (!sheetFile) return { columns: [], rows: [] };
  const xml = await sheetFile.async('string');

  const grid = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let r;
  while ((r = rowRe.exec(xml))) {
    const cells = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cRe.exec(r[1]))) {
      const attrs = c[1] || '';
      const body = c[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="([^"]*)"/) || [])[1];
      const rawV = (body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (type === 's') val = shared[Number(rawV)] ?? '';
      else if (type === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t; while ((t = tRe.exec(body))) val += t[1];
        val = decodeXml(val);
      } else if (rawV != null) val = decodeXml(rawV);
      const idx = ref ? colToIndex(ref) : cells.length;
      cells[idx] = val;
    }
    grid.push(cells);
  }

  // First non-empty row is the header.
  const headerRow = grid.find(row => row.some(v => String(v ?? '').trim() !== '')) || [];
  const columns = headerRow.map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  const dataRows = grid.slice(grid.indexOf(headerRow) + 1)
    .filter(row => row.some(v => String(v ?? '').trim() !== ''))
    .map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i] != null ? String(row[i]) : ''; });
      return obj;
    });
  return { columns, rows: dataRows };
}

export async function parseTabular(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(file);
  if (name.endsWith('.xlsx')) return parseXlsx(file);
  throw new Error('Unsupported file type for tabular ingestion');
}

export default parseTabular;
