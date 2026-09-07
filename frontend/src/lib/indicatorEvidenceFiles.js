import { supabase } from '../supabaseClient';

export const EVIDENCE_BUCKET = 'merl-indicator-evidence';
const MAX_BYTES = 25 * 1024 * 1024;
const MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', geojson: 'application/geo+json', json: 'application/json', zip: 'application/zip',
};
const PREFIX = `storage://${EVIDENCE_BUCKET}/`;

export async function uploadIndicatorEvidence(projectId, indicatorId, file) {
  if (!file || file.size === 0 || file.size > MAX_BYTES) throw new Error('Choose a non-empty file smaller than 25 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const contentType = MIME[extension];
  if (!contentType) throw new Error('This file type is not supported. Use PDF, image, Word, Excel, CSV, GeoJSON or ZIP.');
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || `evidence.${extension}`;
  const path = `${projectId}/${indicatorId}/${crypto.randomUUID()}/${name}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return PREFIX + path;
}

export async function removeIndicatorEvidence(uri) {
  if (!uri?.startsWith(PREFIX)) return;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([uri.slice(PREFIX.length)]);
  if (error) throw error;
}

export async function openIndicatorEvidence(uri) {
  if (!uri) throw new Error('No file is attached.');
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    let url;
    if (uri.startsWith(PREFIX)) {
      const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(uri.slice(PREFIX.length), 60);
      if (error) throw error;
      url = data.signedUrl;
    } else {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'https:') throw new Error('Only HTTPS evidence links are supported.');
      url = parsed.href;
    }
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
}
