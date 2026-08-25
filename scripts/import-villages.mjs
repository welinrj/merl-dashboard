#!/usr/bin/env node
// import-villages.mjs — load a village gazetteer into merl.ref_villages.
//
//   node scripts/import-villages.mjs villages.geojson
//   node scripts/import-villages.mjs villages.csv --dry-run
//
// Accepts GeoJSON (points, or polygons reduced to their centroid) and CSV. A
// shapefile must be converted first — it is three or four files, not one, and
// the conversion belongs in GDAL rather than here:
//
//   ogr2ogr -f GeoJSON -t_srs EPSG:4326 villages.geojson villages.shp
//
// Column and property names vary by source, so the reader looks for the usual
// spellings rather than demanding one schema. Anything it cannot place is
// reported rather than guessed at — a village filed under the wrong province is
// worse than a village the officer has to add by hand.
//
// Re-running is safe: villages are matched on name within island and updated in
// place, so a corrected file can simply be imported again.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const PROVINCES = {
  torba: 'TORBA', sanma: 'SANMA', penama: 'PENAMA',
  malampa: 'MALAMPA', shefa: 'SHEFA', tafea: 'TAFEA',
};

// The property names these datasets actually use, in the order to try them.
const FIELDS = {
  name: ['name', 'village', 'village_name', 'villagename', 'settlement', 'place',
         'placename', 'place_name', 'locality', 'nam', 'name_en', 'label'],
  province: ['province', 'province_code', 'prov', 'province_name', 'adm1', 'adm1_name',
             'name_1', 'prov_name'],
  island: ['island', 'island_name', 'isl', 'adm2', 'adm2_name', 'name_2'],
  areaCouncil: ['area_council', 'areacouncil', 'ac', 'area_coun', 'adm3', 'adm3_name',
                'name_3', 'council'],
  latitude: ['latitude', 'lat', 'y', 'ycoord', 'y_coord', 'northing'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'x', 'xcoord', 'x_coord', 'easting'],
  externalRef: ['id', 'fid', 'objectid', 'gid', 'code', 'village_id', 'ref'],
};

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s\-.]/g, '_');

/** First matching property, whatever the source called it. */
function pick(props, candidates) {
  const byNorm = new Map(Object.entries(props ?? {}).map(([k, v]) => [norm(k), v]));
  for (const c of candidates) {
    const v = byNorm.get(c);
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

const toProvinceCode = (raw) => {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return PROVINCES[key]
      ?? PROVINCES[key.replace(/\s*province\s*$/, '')]
      ?? null;
};

const toNumber = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Representative point of any geometry: the point itself, or a ring's centroid. */
function centroid(geometry) {
  if (!geometry) return null;
  const { type, coordinates: c } = geometry;
  if (type === 'Point') return { longitude: c[0], latitude: c[1] };
  if (type === 'MultiPoint' || type === 'LineString') return centroid({ type: 'Point', coordinates: c[0] });
  if (type === 'Polygon') return ringCentroid(c[0]);
  if (type === 'MultiPolygon') return ringCentroid(c[0]?.[0]);
  if (type === 'MultiLineString') return centroid({ type: 'Point', coordinates: c[0]?.[0] });
  return null;
}

function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return { longitude: x / ring.length, latitude: y / ring.length };
}

// ── Readers ──────────────────────────────────────────────────────────────────

function readGeoJSON(text) {
  const doc = JSON.parse(text);
  const features = doc.type === 'FeatureCollection' ? doc.features
                 : doc.type === 'Feature' ? [doc]
                 : null;
  if (!features) throw new Error('Not a GeoJSON FeatureCollection.');
  return features.map((f) => {
    const point = centroid(f.geometry) ?? {};
    return {
      props: f.properties ?? {},
      latitude: point.latitude ?? null,
      longitude: point.longitude ?? null,
    };
  });
}

/** Minimal RFC-4180 reader: quoted fields, embedded commas, doubled quotes. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function readCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV has no data rows.');
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const props = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    return { props, latitude: null, longitude: null };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

function toVillage(raw) {
  const { props } = raw;
  const name = pick(props, FIELDS.name);
  const provinceRaw = pick(props, FIELDS.province);
  const latitude = raw.latitude ?? toNumber(pick(props, FIELDS.latitude));
  const longitude = raw.longitude ?? toNumber(pick(props, FIELDS.longitude));

  return {
    name: name ? String(name).trim() : null,
    province_code: toProvinceCode(provinceRaw),
    province_raw: provinceRaw,
    island: pick(props, FIELDS.island),
    area_council: pick(props, FIELDS.areaCouncil),
    latitude, longitude,
    external_ref: pick(props, FIELDS.externalRef),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('-'));
  const dryRun = args.includes('--dry-run');

  if (!file) {
    console.error('Usage: node scripts/import-villages.mjs <villages.geojson|villages.csv> [--dry-run]');
    process.exit(2);
  }

  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!dryRun && (!url || !key)) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run).');
    process.exit(2);
  }

  const text = readFileSync(file, 'utf8');
  const raw = /\.csv$/i.test(file) ? readCSV(text) : readGeoJSON(text);
  const villages = raw.map(toVillage);

  const named = villages.filter((v) => v.name);
  const unnamed = villages.length - named.length;
  const noProvince = named.filter((v) => !v.province_code);
  const noCoords = named.filter((v) => v.latitude == null || v.longitude == null);
  const ready = named;

  console.log(`${basename(file)}: ${villages.length} features`);
  console.log(`  ${ready.length} with a name`);
  if (unnamed) console.log(`  ${unnamed} skipped — no recognisable name field`);
  if (noProvince.length) {
    const seen = [...new Set(noProvince.map((v) => v.province_raw ?? '(blank)'))].slice(0, 8);
    console.log(`  ${noProvince.length} without a province this could map to: ${seen.join(', ')}`);
    console.log('    They still import; the form will show them under every province.');
  }
  if (noCoords.length) console.log(`  ${noCoords.length} without coordinates — no pin on the map`);

  if (ready.length === 0) {
    console.error('Nothing to import. Check the file\'s field names against FIELDS in this script.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\nFirst five, as they would be stored:');
    for (const v of ready.slice(0, 5)) {
      console.log(`  ${v.name} · ${v.province_code ?? '—'} · ${v.island ?? '—'}`
                + ` · ${v.latitude ?? '—'}, ${v.longitude ?? '—'}`);
    }
    console.log('\n--dry-run: nothing was written.');
    return;
  }

  // One request per 2000 villages: large enough that a national gazetteer is a
  // handful of calls, small enough that a failure is cheap to retry.
  const CHUNK = 2000;
  let inserted = 0, updated = 0;
  for (let i = 0; i < ready.length; i += CHUNK) {
    const chunk = ready.slice(i, i + CHUNK).map(({ province_raw, ...v }) => v);
    const res = await fetch(`${url}/rest/v1/rpc/import_villages`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_rows: chunk }),
    });
    if (!res.ok) {
      console.error(`Import failed at row ${i} (${res.status}): ${(await res.text()).slice(0, 400)}`);
      process.exit(1);
    }
    const [result] = await res.json();
    inserted += Number(result?.inserted ?? 0);
    updated += Number(result?.updated ?? 0);
    console.log(`  …${Math.min(i + CHUNK, ready.length)}/${ready.length}`);
  }

  console.log(`\nDone: ${inserted} new, ${updated} updated.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
