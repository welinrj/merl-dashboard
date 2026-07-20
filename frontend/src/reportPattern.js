// Decorative ni-Vanuatu motifs for the generated reports, drawn from the colour
// palette of the traditional Vanuatu pattern (the bold tribal-mask artwork).
// Everything is emitted as self-contained SVG strings so the in-app preview
// (inline SVG) and the Word export (SVG rasterised to PNG) render identically.

// Palette sampled from the traditional pattern: gold, coral-red, teal, cobalt,
// leaf-green, magenta — outlined in near-black on a cream/white ground.
export const VANUATU_PALETTE = ['#F4C21B', '#E5443B', '#1CA6A0', '#2B4C9B', '#3FA535', '#D6417F'];
export const PATTERN_INK = '#17140F';

// A left-to-right multi-colour bar (CSS gradient string) for section rules etc.
export const PALETTE_GRADIENT = `linear-gradient(90deg, ${VANUATU_PALETTE.join(', ')})`;

const svg = (w, h, inner, { par = null, widthAttr = w, heightAttr = h } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${w} ${h}"`
  + (par ? ` preserveAspectRatio="${par}"` : '') + `>${inner}</svg>`;

/**
 * A colourful ni-Vanuatu-inspired motif band — a weave of interlocking
 * diamonds, chevrons, triangles and dots cycling through the traditional
 * palette, framed by two fine rails. Used as a header band on every report.
 * @param {{width?:number,height?:number,responsive?:boolean}} [o]
 */
export function patternBand({ width = 900, height = 26, responsive = false } = {}) {
  const P = VANUATU_PALETTE;
  const unit = 52;
  const n = Math.ceil(width / unit);
  const midY = height / 2;
  let g = `<path d="M0 3 H${width} M0 ${height - 3} H${width}" stroke="${PATTERN_INK}" stroke-width="1" fill="none"/>`;
  for (let i = 0; i < n; i++) {
    const x0 = i * unit;
    const cx = x0 + unit / 2;
    const c1 = P[i % P.length];
    const c2 = P[(i + 3) % P.length];
    const c3 = P[(i + 1) % P.length];
    // central diamond + inner dot
    g += `<path d="M${cx} 5 L${cx + 10} ${midY} L${cx} ${height - 5} L${cx - 10} ${midY} Z" fill="${c1}" stroke="${PATTERN_INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    g += `<circle cx="${cx}" cy="${midY}" r="2.2" fill="${c2}"/>`;
    // connector chevron toward the next diamond
    const xm = x0 + unit;
    g += `<path d="M${xm - 6} ${midY - 3.6} L${xm} ${midY} L${xm - 6} ${midY + 3.6}" fill="none" stroke="${c3}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    // small triangles on the top and bottom rails
    g += `<path d="M${x0 + 3} 3.5 L${x0 + 11} 3.5 L${x0 + 7} 8.5 Z" fill="${P[(i + 2) % P.length]}" stroke="${PATTERN_INK}" stroke-width="0.7"/>`;
    g += `<path d="M${x0 + 3} ${height - 3.5} L${x0 + 11} ${height - 3.5} L${x0 + 7} ${height - 8.5} Z" fill="${P[(i + 4) % P.length]}" stroke="${PATTERN_INK}" stroke-width="0.7"/>`;
  }
  return responsive
    ? svg(width, height, g, { par: 'none', widthAttr: '100%', heightAttr: height })
    : svg(width, height, g);
}

/** A slim segmented multi-colour rule (palette bars) for dividers / accents. */
export function accentRule({ width = 600, height = 5, responsive = false } = {}) {
  const P = VANUATU_PALETTE;
  const seg = width / P.length;
  let g = '';
  P.forEach((c, i) => { g += `<rect x="${(i * seg).toFixed(2)}" y="0" width="${(seg + 0.5).toFixed(2)}" height="${height}" fill="${c}"/>`; });
  return responsive
    ? svg(width, height, g, { par: 'none', widthAttr: '100%', heightAttr: height })
    : svg(width, height, g);
}

/** A small corner/side motif — stacked palette chevrons. */
export function chevronMotif({ size = 40, responsive = false } = {}) {
  const P = VANUATU_PALETTE;
  let g = '';
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 8;
    g += `<path d="M6 ${y} L${size / 2} ${y + 6} L${size - 6} ${y}" fill="none" stroke="${P[i % P.length]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return responsive ? svg(size, size, g, { par: 'none', widthAttr: '100%', heightAttr: size }) : svg(size, size, g);
}

export const svgDataUri = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
