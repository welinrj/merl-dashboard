# 005 — Retire dead animation code

- **Status**: TODO
- **Severity**: MEDIUM
- **Commit**: bbf9324
- **Category**: Purpose & frequency
- **Estimated scope**: 5 files deleted, ~1,077 lines removed; ~20 CSS lines removed; 2 deps removed

## Problem

Every line of motion-library code in this app is unreachable, and the only
dependency it justifies is dead weight.

**Unreachable components** (nothing imports them from any route):

| File | Lines | Notes |
| --- | --- | --- |
| `frontend/src/components/ui/vaporize-text-cycle.tsx` | 854 | canvas text effect, three `requestAnimationFrame` loops (lines 208, 278, 281) |
| `frontend/src/components/ui/infinite-slider.tsx` | 109 | the app's only `motion/react` import (line 3) |
| `frontend/src/components/logo-cloud.tsx` | 49 | the only importer of `infinite-slider`; itself imported by nothing |
| `frontend/src/components/ui/text-animation.tsx` | 58 | unreferenced |
| `frontend/src/components/ui/text-animation-demo.tsx` | 7 | unreferenced |

Verified: `grep -rn "vaporize-text-cycle\|text-animation\|logo-cloud" --include=*.tsx --include=*.jsx frontend/src` returns only the files' own definitions, and `logo-cloud.tsx:1` is the sole reference to `infinite-slider`.

**Dependencies** existing only to serve that chain — `motion` (^12.42.2) and
`react-use-measure` (^2.1.7), both imported only at `infinite-slider.tsx:3,5`.

**Dead animated CSS** in `frontend/src/index.css`:

- `.animate-fade-up` (line 223) + `@keyframes fadeUp` (224) — no JSX reference
- `.animate-fade` (line 228) + `@keyframes fadeIn` (229) — no JSX reference
- `.progress-bar` (202) / `.progress-fill` (206, `transition: width 0.4s ease`) — no JSX reference; the two live progress bars are inline at `pages/MerlReporting.jsx:533` and `pages/ProjectSetup.jsx:199`
- `.dash-hero*` (426–480), `@keyframes dh-kenburns` (483), and the
  `prefers-reduced-motion` block at 485–487 — no JSX reference

That last one matters beyond tidiness: **the codebase's only
`prefers-reduced-motion` rule guards an element that is never rendered**, so the
portal currently honours the setting nowhere. Plans 002 and 004 add real coverage.

Vite tree-shakes the unused modules, so this is not a bundle-size defect — it is a
correctness-of-signal one. The `motion` dependency implies a motion system the app
does not have, and the next contributor reaching for animation will reasonably
assume Framer Motion is the house tool when in fact every animation here is CSS.

## Target

The five files deleted, both dependencies removed from
`frontend/package.json`, and the dead CSS rules removed from
`frontend/src/index.css`. No behaviour change anywhere in the running app.

## Repo conventions to follow

- `frontend/package.json` lists dependencies alphabetically — remove the two lines
  and leave ordering intact.
- `frontend/package-lock.json` must be regenerated with `npm install` (the repo's
  own tooling), never hand-edited. CI runs `npm ci` (`.github/workflows/` — the
  `Typecheck & build frontend` job), which fails if the lockfile disagrees with
  `package.json`.

## Steps

1. Delete the five files listed in the Problem table.
2. Remove `"motion"` and `"react-use-measure"` from `dependencies` in
   `frontend/package.json`.
3. From `frontend/`, run `npm install` to regenerate `package-lock.json`.
4. In `frontend/src/index.css`, delete: `.animate-fade-up` + `@keyframes fadeUp`
   (223–227); `.animate-fade` + `@keyframes fadeIn` (228–232); `.progress-bar` and
   `.progress-fill` (202–208); the `.dash-hero*` rules (426–480), `@keyframes
   dh-kenburns` (483), and the `prefers-reduced-motion` block at 485–487.
5. Before deleting each CSS rule, re-run the reference check for its class name
   across `frontend/src` — if any returns a hit, KEEP that rule and report it.

## Boundaries

- Do NOT delete `.topnav*` / `.bottomnav*` CSS. Those are also unreferenced, but
  `CLAUDE.md` documents them as the current shell architecture, so retiring them is
  a documentation decision for the maintainer, not part of this plan.
- Do NOT touch `LoadingSkeleton.jsx` or `.ov-skel` — both are live (plan 004).
- Do NOT remove any other dependency.
- Do NOT "port" the deleted components anywhere.
- If any of the five files turns out to be imported after all, STOP and report.

## Verification

- **Mechanical**: from `frontend/`, run in order — `npm ci` (must succeed against
  the regenerated lockfile), `npx tsc --noEmit`, `npm run build`. All three must pass.
- **Feel check**: run the app and click through Overview, Dashboards, Project
  Setup, MERL Reporting and Reports at both 375px and desktop width. Nothing may
  change visually — this plan removes only unreachable code. Specifically confirm
  the two live progress bars (Project Setup completion, MERL Reporting completion)
  still fill and animate.
- **Done when**: `grep -rn "motion/react\|react-use-measure" frontend/src` returns
  nothing, `npm ci && npx tsc --noEmit && npm run build` passes, and the app is
  visually unchanged.
