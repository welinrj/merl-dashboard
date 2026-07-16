// Chart generation for the quarterly report. Each chart is produced as an
// SVG string from a single source, so the in-app preview (inline SVG) and the
// Word export (SVG rasterised to PNG) render identically. All text is ASCII
// and styling is inlined so the SVG is self-contained.

export const C = {
  green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186',
  ink: '#1a1712', muted: '#6b6258', grid: '#e7e2d8', axis: '#b8b0a4',
};
export const THEME_COL = {
  Adaptation: '#0e6e6e', Mitigation: '#d99a2b', Governance: '#b3402f',
  Finance: '#158a7a', Knowledge: '#9a6d3b', 'Cross-cutting': '#5c6b8a',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function frame(width, height, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`
    + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>${inner}</svg>`;
}

/* ── Donut: delivery status ─────────────────────────────────────────────── */
function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function donutSeg(cx, cy, ro, ri, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, ro, a0), [x1, y1] = polar(cx, cy, ro, a1);
  const [x2, y2] = polar(cx, cy, ri, a1), [x3, y3] = polar(cx, cy, ri, a0);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${ro} ${ro} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
    + ` L${x2.toFixed(1)} ${y2.toFixed(1)} A${ri} ${ri} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
}

export function statusDonut(segments, { width = 460, height = 200, centerLabel = '', centerSub = '' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const cx = 95, cy = height / 2, ro = 72, ri = 44;
  let a = -Math.PI / 2, arcs = '';
  segments.forEach(s => {
    const frac = s.value / total;
    if (s.value > 0) {
      const a1 = a + frac * Math.PI * 2;
      // A full-circle single segment needs two arcs to render.
      if (frac >= 0.9999) {
        arcs += `<path d="${donutSeg(cx, cy, ro, ri, a, a + Math.PI)}" fill="${s.color}"/>`
             +  `<path d="${donutSeg(cx, cy, ro, ri, a + Math.PI, a1)}" fill="${s.color}"/>`;
      } else {
        arcs += `<path d="${donutSeg(cx, cy, ro, ri, a, a1)}" fill="${s.color}"/>`;
      }
      a = a1;
    }
  });
  const cLabel = centerLabel
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="26" font-weight="700" fill="${C.ink}">${esc(centerLabel)}</text>`
      + `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(centerSub)}</text>`
    : '';
  let ly = cy - segments.length * 10;
  const legend = segments.map(s => {
    const row = `<rect x="200" y="${ly}" width="11" height="11" rx="2" fill="${s.color}"/>`
      + `<text x="218" y="${ly + 10}" font-size="12" fill="${C.ink}">${esc(s.label)}</text>`
      + `<text x="${width - 14}" y="${ly + 10}" text-anchor="end" font-size="12" font-weight="700" fill="${C.ink}">${s.value} (${Math.round(s.value / total * 100)}%)</text>`;
    ly += 22;
    return row;
  }).join('');
  return frame(width, height, arcs + cLabel + legend);
}

/* ── Horizontal stacked bars: activities by theme & status ──────────────── */
export function themeStatusBars(rows, { width = 520 } = {}) {
  const padL = 108, padR = 44, padT = 16, rowH = 26, gap = 10;
  const height = padT + rows.length * (rowH + gap) + 8;
  const maxTotal = Math.max(1, ...rows.map(r => r.total));
  const bw = width - padL - padR;
  let y = padT, bars = '';
  rows.forEach(r => {
    let x = padL;
    bars += `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="${C.ink}">${esc(r.theme)}</text>`;
    [['green', r.green], ['amber', r.amber], ['red', r.red], ['none', r.none]].forEach(([k, v]) => {
      if (v > 0) {
        const w = (v / maxTotal) * bw;
        bars += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${C[k]}"/>`;
        if (w > 16) bars += `<text x="${(x + w / 2).toFixed(1)}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${v}</text>`;
        x += w;
      }
    });
    bars += `<text x="${(x + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" font-size="10" font-weight="700" fill="${C.muted}">${r.total}</text>`;
    y += rowH + gap;
  });
  return frame(width, height, bars);
}

/* ── Horizontal bars: values (e.g. budget by theme, VUV millions) ───────── */
export function valueBars(bars, { width = 520, unit = '', colorByLabel = null } = {}) {
  const padL = 108, padR = 56, padT = 12, rowH = 22, gap = 10;
  const height = padT + bars.length * (rowH + gap) + 8;
  const maxV = Math.max(1, ...bars.map(b => b.value));
  const bw = width - padL - padR;
  let y = padT, out = '';
  bars.forEach(b => {
    const w = (b.value / maxV) * bw;
    const col = b.color || (colorByLabel && colorByLabel[b.label]) || C.green;
    out += `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="${C.ink}">${esc(b.label)}</text>`
      + `<rect x="${padL}" y="${y}" width="${Math.max(1, w).toFixed(1)}" height="${rowH}" rx="3" fill="${col}"/>`
      + `<text x="${(padL + Math.max(1, w) + 6).toFixed(1)}" y="${y + rowH / 2 + 4}" font-size="10" font-weight="700" fill="${C.muted}">${esc(b.display != null ? b.display : b.value)}${unit}</text>`;
    y += rowH + gap;
  });
  return frame(width, height, out);
}

/* ── Grouped bars: planned vs actual budget ─────────────────────────────── */
export function plannedActualBars(rows, { width = 520 } = {}) {
  const padL = 108, padR = 20, padT = 12, rowH = 24, gap = 14;
  const height = padT + rows.length * (rowH + gap) + 26;
  const maxV = Math.max(1, ...rows.map(r => Math.max(r.planned, r.actual)));
  const bw = width - padL - padR;
  let y = padT, out = '';
  rows.forEach(r => {
    const wp = (r.planned / maxV) * bw, wa = (r.actual / maxV) * bw;
    out += `<text x="${padL - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="${C.ink}">${esc(r.component)}</text>`
      + `<rect x="${padL}" y="${y}" width="${Math.max(1, wp).toFixed(1)}" height="${rowH / 2 - 1}" rx="2" fill="${C.axis}"/>`
      + `<rect x="${padL}" y="${y + rowH / 2 + 1}" width="${Math.max(1, wa).toFixed(1)}" height="${rowH / 2 - 1}" rx="2" fill="${C.green}"/>`;
    y += rowH + gap;
  });
  out += `<rect x="${padL}" y="${y}" width="11" height="11" rx="2" fill="${C.axis}"/><text x="${padL + 16}" y="${y + 10}" font-size="11" fill="${C.ink}">Planned</text>`
    + `<rect x="${padL + 90}" y="${y}" width="11" height="11" rx="2" fill="${C.green}"/><text x="${padL + 106}" y="${y + 10}" font-size="11" fill="${C.ink}">Actual</text>`;
  return frame(width, height, out);
}

/* ── Dispatch a report figure (from buildQuarterlyReport) to its SVG ────── */
export function renderFigureSvg(fig, opts = {}) {
  switch (fig.kind) {
    case 'donut':        return statusDonut(fig.data.segments, { ...fig.data, ...opts });
    case 'themeStatus':  return themeStatusBars(fig.data.rows, opts);
    case 'valueBars':    return valueBars(fig.data.bars, { unit: fig.data.unit || '', ...opts });
    case 'plannedActual':return plannedActualBars(fig.data.rows, opts);
    default:             return frame(320, 80, `<text x="12" y="44" font-size="12" fill="${C.muted}">No chart</text>`);
  }
}

/* ── Browser-only: rasterise an SVG string to PNG bytes for docx embedding ─ */
export function svgToPngBytes(svg, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('toBlob failed'));
        blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab))).catch(reject);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// Pull width/height out of an SVG string produced by the generators above.
export function svgDims(svg) {
  const w = +(/width="(\d+)"/.exec(svg) || [])[1] || 520;
  const h = +(/height="(\d+)"/.exec(svg) || [])[1] || 200;
  return { width: w, height: h };
}
