import JSZip from 'jszip';

const MIN_TEXT_CHARS = 60;
const MAX_PDF_PAGES = 80;
const MAX_OCR_PAGES = 20;

function decodeXml(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function xmlText(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, ''))).filter(Boolean).join(' ');
}

function readableText(text) {
  return String(text || '').replace(/\u0000/g, ' ').replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function summarizeEvidenceText(text, { method, pages = null, ocrAvailable = false } = {}) {
  const normalized = readableText(text);
  const digits = (normalized.match(/\d/g) || []).length;
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const numericCandidates = [...normalized.matchAll(/(?:^|\n|\s)([-+]?\d[\d,]*(?:\.\d+)?%?)(?=\s|$|[,;.)])/g)]
    .map((match) => ({ value: match[1].replace(/,/g, ''), context: normalized.slice(Math.max(0, match.index - 90), Math.min(normalized.length, match.index + match[0].length + 110)).replace(/\s+/g, ' ').trim() }))
    .filter((candidate) => Number.isFinite(Number(candidate.value.replace(/%$/, ''))))
    .slice(0, 60);
  const status = normalized.length >= MIN_TEXT_CHARS ? 'reviewable' : (ocrAvailable ? 'needs_ocr' : 'insufficient_text');
  return {
    status, method, pages, characterCount: normalized.length, wordCount: words.length,
    digitCount: digits, text: normalized, numericCandidates,
    message: status === 'reviewable' ? null : (ocrAvailable
      ? 'This file has little selectable text. Device OCR is available; review any recognised text carefully.'
      : 'This file has little selectable text. It may be blank, a scan, or an unsupported layout. No external OCR service was used.'),
  };
}

async function runDeviceOcr(blob) {
  if (typeof globalThis.TextDetector !== 'function' || typeof createImageBitmap !== 'function') return { text: '', available: false };
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const detector = new globalThis.TextDetector();
      const blocks = await detector.detect(bitmap);
      return { text: (blocks || []).map((block) => block.rawValue || '').join('\n'), available: true };
    } finally { bitmap.close?.(); }
  } catch { return { text: '', available: true }; }
}

async function readDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('The DOCX file is missing its main document.');
  const xml = await document.async('string');
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((paragraph) => xmlText(paragraph[1], 'w:t')).filter(Boolean).join('\n');
}

async function readXlsx(file) {
  const zip = await JSZip.loadAsync(file);
  const shared = zip.file('xl/sharedStrings.xml');
  const strings = shared ? [...(await shared.async('string')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)]
    .map((match) => xmlText(match[1], 't')) : [];
  const names = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/sheet(\d+)/)[1]) - Number(b.match(/sheet(\d+)/)[1]));
  if (!names.length) throw new Error('The workbook has no readable worksheets.');
  const sheets = [];
  for (const name of names.slice(0, 12)) {
    const xml = await zip.file(name).async('string');
    const rows = [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].map((row) => [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
      const type = cell[1].match(/\bt="([^"]+)"/i)?.[1];
      const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      return type === 's' ? (strings[Number(value)] || '') : type === 'inlineStr' ? xmlText(cell[2], 't') : decodeXml(value);
    }).filter(Boolean).join(' | ')).filter(Boolean);
    if (rows.length) sheets.push(rows.join('\n'));
  }
  return sheets.join('\n\n');
}

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  if (document.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${document.numPages} pages. Split it into files of ${MAX_PDF_PAGES} pages or fewer for local review.`);
  const pages = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ');
    pages.push({ pageNo, text });
  }
  let text = pages.filter((page) => page.text.trim()).map((page) => `Page ${page.pageNo}\n${page.text}`).join('\n');
  let ocrAvailable = false;
  if (readableText(text).length < MIN_TEXT_CHARS && typeof globalThis.TextDetector === 'function') {
    const ocrPages = [];
    for (const pageInfo of pages.slice(0, MAX_OCR_PAGES)) {
      const page = await document.getPage(pageInfo.pageNo);
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = 0; canvas.height = 0;
      if (blob) {
        const ocr = await runDeviceOcr(blob);
        ocrAvailable ||= ocr.available;
        if (ocr.text) ocrPages.push(`Page ${pageInfo.pageNo} (device OCR)\n${ocr.text}`);
      }
    }
    if (ocrPages.length) text = ocrPages.join('\n');
    if (document.numPages > MAX_OCR_PAGES && ocrPages.length) text += `\nOCR limited to the first ${MAX_OCR_PAGES} pages; review remaining pages manually.`;
  }
  return { text, pages: document.numPages, method: readableText(text).length >= MIN_TEXT_CHARS ? (pages.some((p) => p.text.trim()) ? 'pdf-text' : 'device-ocr') : 'pdf-text', ocrAvailable };
}

export async function readEvidenceDocument(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let text = '';
  let method = ext || 'unknown';
  let pages = null;
  let ocrAvailable = false;
  if (['csv', 'json', 'geojson', 'txt'].includes(ext)) {
    text = await file.text();
    if (['json', 'geojson'].includes(ext)) {
      try { text = JSON.stringify(JSON.parse(text), null, 2); }
      catch { throw new Error('The JSON document is malformed.'); }
    }
    method = 'local-text';
  } else if (ext === 'docx') {
    text = await readDocx(file);
    method = 'docx-text';
  } else if (ext === 'xlsx') {
    text = await readXlsx(file);
    method = 'xlsx-text';
  } else if (ext === 'pdf') {
    ({ text, pages, method, ocrAvailable } = await readPdf(file));
  } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    const ocr = await runDeviceOcr(file);
    text = ocr.text;
    ocrAvailable = ocr.available;
    method = 'device-ocr';
  } else {
    throw new Error('Local text review supports PDF, DOCX, XLSX, CSV, JSON, GeoJSON, TXT, JPG, PNG, and WEBP files.');
  }
  return summarizeEvidenceText(text, { method, pages, ocrAvailable });
}

export function matchEvidenceToIndicator(review, indicator) {
  if (!review?.text || !indicator) return { matched: false, reason: 'Select a related indicator to check the report text.' };
  const text = review.text.toLocaleLowerCase();
  const terms = [indicator.code, indicator.name].filter(Boolean).map((term) => String(term).trim()).filter((term) => term.length >= 3);
  const matchedTerm = terms.find((term) => text.includes(term.toLocaleLowerCase()));
  return matchedTerm
    ? { matched: true, matchedTerm }
    : { matched: false, reason: 'The selected indicator name or code was not found in the extracted text. Check that the right report and indicator are selected.' };
}
