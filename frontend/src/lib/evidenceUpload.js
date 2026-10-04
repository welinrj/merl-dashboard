import { supabase } from '../supabaseClient';
import JSZip from 'jszip';

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const TYPES = {
  pdf: { mime: 'application/pdf', magic: (b) => ascii(b, 0, 5) === '%PDF-' },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', magic: (b) => b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' },
  webp: { mime: 'image/webp', magic: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: zipMagic },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: zipMagic },
  csv: { mime: 'text/csv', magic: textMagic },
  json: { mime: 'application/json', magic: textMagic },
  geojson: { mime: 'application/geo+json', magic: textMagic },
  zip: { mime: 'application/zip', magic: zipMagic },
};

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
function zipMagic(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
}
function textMagic(bytes) {
  return !bytes.slice(0, 512).some((byte) => byte === 0);
}

export async function inspectEvidenceFile(file) {
  if (!file || !(file instanceof File)) throw new Error('Choose a supporting file.');
  if (file.size === 0) throw new Error('This file is empty. Upload a completed report or evidence file.');
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error('Files must be 25 MB or smaller.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  const type = TYPES[ext];
  if (!type) throw new Error('Use PDF, JPG, PNG, WEBP, DOCX, XLSX, CSV, JSON, GeoJSON, or ZIP.');
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (!type.magic(bytes)) throw new Error('The file contents do not match its filename, or the file is damaged.');
  if (['docx', 'xlsx', 'zip'].includes(ext)) {
    try {
      const archive = await JSZip.loadAsync(file, { checkCRC32: true });
      if (!Object.keys(archive.files).some((name) => !archive.files[name].dir)) throw new Error('empty archive');
      if (ext === 'docx') {
        const document = archive.file('word/document.xml');
        if (!document) throw new Error('not a DOCX document');
        const xml = await document.async('string');
        const text = xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        if (text.replace(/\s/g, '').length < 40) throw new Error('empty DOCX document');
      }
      if (ext === 'xlsx') {
        if (!archive.file('xl/workbook.xml')) throw new Error('not an XLSX workbook');
        const hasValues = Object.keys(archive.files).some((name) => name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml'));
        if (!hasValues) throw new Error('empty XLSX workbook');
      }
    } catch {
      throw new Error('This archive is corrupt or is not a valid DOCX, XLSX, or ZIP file.');
    }
  }
  if (['csv', 'json', 'geojson'].includes(ext)) {
    const body = (await file.text()).replace(/^\uFEFF/, '').trim();
    if (body.length < 40) throw new Error('This file has too little readable content to be a report.');
    if (ext === 'csv') {
      const rows = body.split(/\r?\n/).filter((row) => row.trim());
      if (rows.length < 2) throw new Error('This CSV has a header but no data rows.');
    }
    if (ext === 'json' || ext === 'geojson') {
      let data;
      try { data = JSON.parse(body); } catch { throw new Error('This JSON file is malformed.'); }
      if (ext === 'geojson' && !['FeatureCollection', 'Feature', 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(data?.type)) {
        throw new Error('This GeoJSON file does not contain a valid GeoJSON type.');
      }
    }
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { ext, mime: type.mime, sha256 };
}

/**
 * Evidence lives in a private bucket. A deterministic content-addressed object
 * path prevents the same bytes being uploaded repeatedly for one project.
 * Database lookup prevents attaching that same object to multiple evidence rows.
 */
export async function uploadEvidenceFile(file, projectId) {
  const { ext, mime, sha256 } = await inspectEvidenceFile(file);
  const path = `${projectId}/sha256/${sha256}.${ext}`;
  const { data: existing, error: lookupError } = await supabase
    .from('v_evidence').select('id').eq('file_url', path).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) throw new Error('This exact file is already attached to an evidence record for this project.');

  const { error } = await supabase.storage.from('merl-indicator-evidence').upload(path, file, {
    contentType: mime, cacheControl: '3600', upsert: false,
  });
  if (error) {
    // A storage collision with no evidence row can happen after an interrupted
    // save. Reuse the immutable, hash-matched object; never overwrite it.
    if (!/already exists|duplicate|409/i.test(error.message || '')) throw error;
    const { data: attached, error: secondLookupError } = await supabase
      .from('v_evidence').select('id').eq('file_url', path).maybeSingle();
    if (secondLookupError) throw secondLookupError;
    if (attached) throw new Error('This exact file is already attached to an evidence record for this project.');
    throw new Error('This file is already in storage but has no evidence record. Ask a MERL administrator to review it before retrying.');
  }
  return { path, uploaded: true };
}

export async function removeEvidenceFile(path) {
  if (!path) return;
  const { error } = await supabase.storage.from('merl-indicator-evidence').remove([path]);
  if (error) throw error;
}
