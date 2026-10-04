const MIN_TEXT_CHARS = 60;

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

export function matchEvidenceToIndicator(review, indicator) {
  if (!review?.text || !indicator) return { matched: false, reason: 'Select a related indicator to check the report text.' };
  const text = review.text.toLocaleLowerCase();
  const terms = [indicator.code, indicator.name].filter(Boolean).map((term) => String(term).trim()).filter((term) => term.length >= 3);
  const matchedTerm = terms.find((term) => text.includes(term.toLocaleLowerCase()));
  return matchedTerm
    ? { matched: true, matchedTerm }
    : { matched: false, reason: 'The selected indicator name or code was not found in the extracted text. Check that the right report and indicator are selected.' };
}
