// Gedsi.jsx — the portal's ONLY pictogram set.
//
// Beneficiary disaggregation is the one place in this portal where a symbol
// earns its place: the categories (women, men, youth, persons with disability,
// direct vs indirect reach) are read side by side and compared, and a shared
// human silhouette makes that comparison faster than labels alone. Everywhere
// else — financial KPIs, project counts, indicator metrics, reporting figures,
// section headings — the label and the number do the work and carry no symbol.
// Do not import these outside a beneficiary/GEDSI context.
//
// House rules for this set, so it reads as one family rather than a grab bag:
//   · one 24x24 viewBox, drawn on the same grid
//   · stroke-only, 1.6 stroke width, round caps and joins, no fills
//   · currentColor throughout — the caller sets one institutional colour
//   · a shared head + body skeleton; only the distinguishing detail changes
//   · no cartoon faces, no gendered clothing tropes, no emoji, no colour circles
import React from 'react';

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// Female / Male use the standard Venus and Mars symbols on a shared circle
// geometry — internationally recognised, and neutral in a way that drawing
// differently-clothed bodies would not be.
function Female(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </svg>
  );
}
function Male(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="10.5" cy="13.5" r="5" />
      <path d="M14.5 9.5 20 4M15 4h5v5" />
    </svg>
  );
}
// Youth — the same head-and-shoulders silhouette as `direct`, drawn shorter and
// sitting lower on the baseline beside a full-height figure. Distinguished by
// stature alone, so no age caricature is implied.
function Youth(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="16.4" cy="6.4" r="3" />
      <path d="M11.7 20.8a4.7 4.7 0 0 1 9.4 0" />
      <circle cx="6" cy="12.6" r="2.1" />
      <path d="M2.5 20.8a3.5 3.5 0 0 1 7 0" />
    </svg>
  );
}
// Persons with disability — the International Symbol of Access (seated figure
// with wheel), drawn in the same stroke language as the rest of the set.
function Disability(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="9.2" cy="4.4" r="2" />
      <path d="M8 8v5h4.6" />
      <circle cx="10.8" cy="16.4" r="5.2" />
      <path d="M13.4 11.9 16 17.4h3" />
    </svg>
  );
}
// Direct beneficiaries — a single figure: people the project reaches itself.
function Direct(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}
// Indirect beneficiaries — the same figure with a second behind it: reach that
// extends beyond the people counted directly.
function Indirect(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="9.5" cy="7.5" r="3" />
      <path d="M3.5 20.5a6 6 0 0 1 12 0" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.9M17 15.1a6 6 0 0 1 3.5 5.4" />
    </svg>
  );
}
// Total — a group: everyone counted, direct and indirect together.
function Total(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="12" cy="7.6" r="2.8" />
      <path d="M7 20.5a5 5 0 0 1 10 0" />
      <circle cx="4.8" cy="10.4" r="2.2" />
      <circle cx="19.2" cy="10.4" r="2.2" />
      <path d="M1.8 18.4a3.4 3.4 0 0 1 3.6-3.2M22.2 18.4a3.4 3.4 0 0 0-3.6-3.2" />
    </svg>
  );
}

const SET = {
  female: Female, male: Male, youth: Youth, disability: Disability,
  direct: Direct, indirect: Indirect, total: Total,
};

/**
 * A single GEDSI category pictogram.
 *
 * Purely decorative by default (the visible label beside it already names the
 * category, so announcing it twice is noise). Pass `title` only when the
 * pictogram stands alone without a text label.
 *
 * @param {object} props
 * @param {'female'|'male'|'youth'|'disability'|'direct'|'indirect'|'total'} props.name
 * @param {number} [props.size=16]  keep small — 14-18px, per the icon scale
 * @param {string} [props.title]    accessible name; omit when a text label is adjacent
 */
export default function Gedsi({ name, size = 16, title, ...rest }) {
  const Sym = SET[name];
  if (!Sym) return null;
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': 'true', focusable: 'false' };
  return <Sym width={size} height={size} {...a11y} {...rest} />;
}

export const GEDSI_NAMES = Object.keys(SET);
