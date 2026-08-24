// Gedsi.jsx — beneficiary disaggregation pictograms.
//
// Beneficiary disaggregation is the one place in this portal where a symbol
// earns its place: the categories (women, men, youth, persons with disability,
// direct vs indirect reach) are read side by side and compared, and a shared
// human figure makes that comparison faster than labels alone. Everywhere else
// — financial KPIs, project counts, indicator metrics, reporting figures,
// section headings — the label and the number do the work and carry no symbol.
//
// FIVE OF THE SEVEN COME STRAIGHT FROM ICONSAX
// Woman, Man, User, Profile2User and People cover female, male, direct,
// indirect and total exactly, so those are the real Iconsax components, not
// look-alikes — same set, same Linear variant, same 1.5 stroke as the rest of
// the portal's icons.
//
// TWO ARE DRAWN HERE, BECAUSE ICONSAX HAS NO EQUIVALENT
// The catalogue's entire human range is adult head-and-shoulders figures: it
// ships no accessibility symbol and nothing age-related (searched: wheel,
// chair, disab, access, child, kid, baby, teen, young — all empty). Substituting
// a generic `Profile` for those two would leave six of the seven categories as
// near-identical silhouettes, which defeats the reason the pictograms are here
// at all, and would drop the International Symbol of Access — a recognised
// accessibility standard, not a style preference.
//
// So they are drawn from Iconsax's own geometry rather than invented: `Youth`
// reuses the head radius and shoulder curve of Iconsax's `User`, scaled and
// paired to read as a child beside an adult; `Disability` is the International
// Symbol of Access rendered in the same stroke language. Both sit on the same
// 24px grid at 1.5 stroke with round caps, inherit currentColor, and carry no
// fill — so they belong to the family they sit in.
import React from 'react';
import { Woman, Man, User, Profile2User, People } from 'iconsax-reactjs';

// Shared drawing contract for the two locally-drawn figures, matched to the
// Iconsax Linear style so the seven read as one set.
const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// Youth — Iconsax's `User` figure at two scales on a shared baseline: a shorter
// figure beside a full-height one. Distinguished by stature alone, so no age
// caricature is implied. Head radii and shoulder sweeps are the `User` path
// (r=5, shoulders spanning ±8.59) scaled to 0.66 and 0.46.
function Youth(p) {
  return (
    <svg {...BASE} {...p}>
      <circle cx="16" cy="7.2" r="3.3" />
      <path d="M21.7 21.5c0-2.55-2.54-4.62-5.7-4.62s-5.7 2.07-5.7 4.62" />
      <circle cx="6.2" cy="13.2" r="2.3" />
      <path d="M10.15 21.5c0-1.78-1.77-3.22-3.95-3.22s-3.95 1.44-3.95 3.22" />
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

const SET = {
  female: Woman,          // Iconsax — the Venus symbol
  male: Man,              // Iconsax — the Mars symbol
  youth: Youth,           // drawn here (no age-related figure in Iconsax)
  disability: Disability, // drawn here (no accessibility symbol in Iconsax)
  direct: User,           // Iconsax — one figure: reached by the project itself
  indirect: Profile2User, // Iconsax — a figure with another behind it
  total: People,          // Iconsax — the group: everyone counted
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
  // Iconsax components take `size`; the locally-drawn two take width/height.
  const sizing = (Sym === Youth || Sym === Disability)
    ? { width: size, height: size }
    : { size };
  return <Sym {...sizing} {...a11y} {...rest} />;
}

export const GEDSI_NAMES = Object.keys(SET);
