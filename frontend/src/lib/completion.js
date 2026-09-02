// =============================================================================
// completion.js — one definition of "how complete is this record".
//
// Two pages ask the same question of different things. MERL Reporting asks it
// of a reporting period: a module counts as filled once it holds at least one
// record for that period. Project Setup asks it of a project: a form counts as
// filled once every check it carries is satisfied, and a check can be a
// required field on the profile or the presence of an objective, an indicator,
// an activity, a location.
//
// The shapes differ; the arithmetic does not. Both need the same four answers —
// how many sections are done, which required ones are not, what fraction of the
// work is finished, and what to put on a chip — so both get them from here.
// Two implementations of this drift, and then two pages disagree about whether
// the same project is ready.
//
// A section is a plain object:
//   { key, filled, total, required }
// where `filled` of `total` checks are satisfied. A module that is simply
// present-or-absent is the degenerate case: total 1, filled 0 or 1.
// =============================================================================

export const SECTION_DONE = 'done';
export const SECTION_PARTIAL = 'partial';
export const SECTION_EMPTY = 'empty';

/**
 * What state a single section is in.
 *
 * A section with no checks at all is Empty rather than Done: "0 of 0" is not an
 * achievement, and calling it complete would let an unconfigured section count
 * towards a percentage and hide the fact that nothing is being measured.
 */
export function sectionState(section) {
  const total = Number(section?.total) || 0;
  const filled = Number(section?.filled) || 0;
  if (total > 0 && filled >= total) return SECTION_DONE;
  return filled > 0 ? SECTION_PARTIAL : SECTION_EMPTY;
}

/**
 * Roll a list of sections up into the numbers a page header and a submit bar
 * need.
 *
 * `pct` counts whole sections, because that is what "3 of 5 sections" means to
 * an officer. `requiredPct` counts individual checks inside the required
 * sections, because a ring that jumps 20% at a time tells you nothing about a
 * form with fourteen fields in it. They answer different questions and are
 * deliberately not the same number.
 */
export function summarise(sections = []) {
  const list = Array.isArray(sections) ? sections : [];
  const done = list.filter((s) => sectionState(s) === SECTION_DONE).length;
  const total = list.length;

  const required = list.filter((s) => s?.required);
  const missingRequired = required.filter((s) => sectionState(s) !== SECTION_DONE);

  // Clamped, so a section reporting more filled checks than it has cannot push
  // the ring past 100%.
  const checksTotal = required.reduce((n, s) => n + (Number(s?.total) || 0), 0);
  const checksFilled = required.reduce(
    (n, s) => n + Math.min(Number(s?.filled) || 0, Number(s?.total) || 0), 0);

  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    requiredDone: required.length - missingRequired.length,
    requiredTotal: required.length,
    missingRequired,
    checksFilled,
    checksTotal,
    requiredPct: checksTotal ? Math.round((checksFilled / checksTotal) * 100) : 0,
  };
}

/**
 * Build sections for the present-or-absent case: a module is filled when it
 * holds at least one record. `counts` is a map of module key to record count.
 *
 * This is what MERL Reporting has always meant by a complete section; it is
 * expressed here so it goes through the same `summarise` as everything else.
 */
export function recordCountSections(modules = [], counts = {}) {
  return modules.map((m) => ({
    ...m,
    filled: (counts?.[m.key] || 0) > 0 ? 1 : 0,
    total: 1,
    required: !!m.requiredForSubmission,
  }));
}

/**
 * Build one section from a list of checks.
 *
 * Each check is `{ ok, label }`; the ones that are not ok are carried on the
 * section as `issues` so a banner can name what is actually missing instead of
 * printing a percentage at someone. `label` is an i18n key or a resolved
 * string — this module never renders, so it does not care which.
 */
export function checkSection(key, checks = [], { required = true, ...rest } = {}) {
  const list = checks.filter(Boolean);
  return {
    key,
    ...rest,
    required,
    filled: list.filter((c) => c.ok).length,
    total: list.length,
    issues: list.filter((c) => !c.ok),
  };
}
