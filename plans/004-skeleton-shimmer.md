# 004 — Unify the two skeleton shimmers and make them linear

- **Status**: DONE
- **Commit**: bbf9324
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion / Accessibility
- **Estimated scope**: 2 files, ~15 lines

## Problem

The portal has **two** independent skeleton shimmers with different durations and
different (both wrong) easings:

```css
/* frontend/src/index.css:759 — current */
.ov-skel { border-radius: 8px; background: linear-gradient(90deg,var(--surface-1) 25%,var(--surface-2) 37%,var(--surface-1) 63%); background-size: 400% 100%; animation: ovShimmer 1.4s ease infinite; }
@keyframes ovShimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }
```

```js
/* frontend/src/components/ui/LoadingSkeleton.jsx:15 — current */
const shimmer = {
  …
  animation: 'merl-skeleton 1.3s ease-in-out infinite',
};
/* frontend/src/components/ui/LoadingSkeleton.jsx:24 */
return <style>{`@keyframes merl-skeleton{0%{background-position:100% 0}100%{background-position:0 0}}`}</style>;
```

Both are live: `.ov-skel` is used at `frontend/src/pages/Overview.jsx:572`, and
`LoadingSkeleton` is used by `components/ui/DataTable.jsx`,
`pages/Dashboards.jsx` and `pages/ProjectPortfolioAnalysis.jsx`. A user moving
between Overview and Dashboards sees two different loading rhythms for the same
concept.

Three defects:

1. **Wrong easing.** A shimmer is constant motion; the audit rule is `linear`.
   `ease` and `ease-in-out` make the sweep accelerate and stall at each end, so it
   visibly pulses instead of travelling.
2. **Divergent durations.** 1.4s vs 1.3s — near-identical values that should be one token.
3. **No reduced-motion handling.** Both loop forever. The only
   `prefers-reduced-motion` block in the codebase is `index.css:485`, and it guards
   `.dash-hero-bg`, which no JSX renders — so effective reduced-motion coverage for
   the whole portal is zero. An infinite sweep is exactly the motion that setting
   exists to stop.

## Target

One shared duration and curve, `linear`, with reduced motion falling back to a
static tint (skeletons must still read as "loading", so keep the surface, drop the
travel):

```css
/* frontend/src/index.css:759 — target */
.ov-skel {
  border-radius: 8px;
  background: linear-gradient(90deg,var(--surface-1) 25%,var(--surface-2) 37%,var(--surface-1) 63%);
  background-size: 400% 100%;
  animation: ovShimmer var(--dur-shimmer) linear infinite;
}
@keyframes ovShimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }

@media (prefers-reduced-motion: reduce) {
  .ov-skel { animation: none; background: var(--surface-2); }
}
```

Add one token to `:root` in `frontend/src/index.css`, next to the motion tokens
from plan 001:

```css
  --dur-shimmer: 1400ms;
```

```js
/* frontend/src/components/ui/LoadingSkeleton.jsx:15 — target */
const shimmer = {
  …
  animation: 'merl-skeleton var(--dur-shimmer) linear infinite',
};
```

```js
/* frontend/src/components/ui/LoadingSkeleton.jsx:24 — target */
return <style>{`
  @keyframes merl-skeleton{0%{background-position:100% 0}100%{background-position:-100% 0}}
  @media (prefers-reduced-motion: reduce){[data-merl-skeleton]{animation:none!important;background:var(--surface-2)!important}}
`}</style>;
```

Note the keyframe end value changes from `0 0` to `-100% 0` so both shimmers travel
the same distance in the same time — currently they do not, which is why they drift
out of sync even at similar durations.

The reduced-motion rule needs a selector, and the skeleton span is styled inline
(inline styles cannot be overridden by a media query — `CLAUDE.md` calls this out
explicitly). So the span must carry a `data-merl-skeleton` attribute for the rule
to target, and the rule needs `!important` to beat the inline `animation`.

## Repo conventions to follow

- `LoadingSkeleton.jsx` injects its keyframes through a `<style>` element rather
  than the global stylesheet (see `LoadingSkeleton.jsx:24`) — keep that pattern,
  do not move these keyframes into `index.css`.
- Reduced-motion blocks are top-level `@media (prefers-reduced-motion: reduce)` —
  see `index.css:485` for the existing shape.
- Skeleton spans already spread `style` and take `width`/`height` props
  (`LoadingSkeleton.jsx:28`) — add the data attribute alongside the existing
  `aria-hidden="true"`.

## Steps

1. In `frontend/src/index.css`, add `--dur-shimmer: 1400ms;` to `:root` beside the
   plan-001 motion tokens.
2. In `frontend/src/index.css:759`, change `1.4s ease` to `var(--dur-shimmer) linear`.
3. Immediately after the `ovShimmer` keyframes, add the
   `@media (prefers-reduced-motion: reduce)` block from the Target section.
4. In `frontend/src/components/ui/LoadingSkeleton.jsx:18`, change
   `'merl-skeleton 1.3s ease-in-out infinite'` to
   `'merl-skeleton var(--dur-shimmer) linear infinite'`.
5. In `LoadingSkeleton.jsx:24`, replace the injected `<style>` content with the
   target version (changed keyframe end value + reduced-motion rule).
6. In `LoadingSkeleton.jsx:28`, add `data-merl-skeleton=""` to the returned `<span>`,
   next to `aria-hidden="true"`.

## Boundaries

- Do NOT change the gradient colours, `background-size`, `border-radius`, or the
  skeleton's layout/sizing props.
- Do NOT replace either shimmer with a spinner or a motion-library animation.
- Do NOT delete one implementation in favour of the other — merging the two
  components is a larger refactor and is out of scope for this plan.
- Do NOT add dependencies.
- If either excerpt no longer matches (drift since bbf9324), STOP and report.

## Verification

- **Mechanical**: from `frontend/`, `npx tsc --noEmit` and `npm run build` must pass.
- **Feel check**: run the app and throttle the network (DevTools → Network → Slow 3G)
  so skeletons stay on screen.
  - Load Overview (uses `.ov-skel`) and Dashboards (uses `LoadingSkeleton`) —
    the two shimmers must now travel at visibly the same speed and rhythm.
  - Watch one shimmer for several cycles: the highlight must travel at a
    **constant** speed with no stall or lurch at either end.
  - In the Rendering panel set `prefers-reduced-motion: reduce`, reload: both
    skeletons must go static and flat, still visible as grey placeholder blocks —
    they must NOT disappear or collapse to zero height.
- **Done when**: both shimmers share one duration and `linear`, both stop under
  reduced motion while remaining visible, and the build passes.
