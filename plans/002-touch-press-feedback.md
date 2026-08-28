# 002 — Give buttons a press state for touch

- **Status**: TODO
- **Commit**: bbf9324
- **Severity**: HIGH
- **Category**: Purpose & frequency / Physicality
- **Estimated scope**: 1 file, ~8 added lines
- **Depends on**: 001 (uses `--ease-out`, `--dur-fast`)

## Problem

`.btn` animates only `background` and `border-color`, and every feedback rule in
the stylesheet is a `:hover` rule:

```css
/* frontend/src/index.css:127 — current */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 0.4rem; border-radius: var(--radius-control); padding: 0.5rem 1rem;
  font-size: 0.8125rem; font-weight: 600; font-family: var(--font-ui);
  line-height: 1; letter-spacing: -0.01em;
  transition: background 0.15s, border-color 0.15s;
  cursor: pointer; border: none; white-space: nowrap;
}
/* frontend/src/index.css:138 */ .btn-primary:hover:not(:disabled) { background: var(--green-700); }
/* frontend/src/index.css:144 */ .btn-secondary:hover:not(:disabled) { background: var(--surface-1); border-color: var(--border-strong); }
/* frontend/src/index.css:146 */ .btn-gold:hover:not(:disabled) { background: var(--gold-400); }
/* frontend/src/index.css:148 */ .btn-danger:hover:not(:disabled) { background: var(--red-700); }
```

There is exactly one `:active` rule in the whole stylesheet
(`index.css:362`, `.bottomnav-item:active`) and it belongs to the retired
`.bottomnav` shell, which no JSX renders — so it never fires.

Phones have no hover. `CLAUDE.md` states the portal is used on phones in the
field, so on the primary device every tap of Save, Submit or Delete produces **no
acknowledgement at all** until the async work resolves. That is the single
highest-leverage motion defect in the app: it affects every button, on every
screen, on the device that matters most, and users respond by tapping again.

## Target

Press feedback that matches the app's deliberately flat language. The stylesheet
twice documents the intent — `index.css:99` "no lift", `index.css:106` "no float /
lift" — so this uses a colour step plus a very subtle scale, not a lift or glow:

```css
/* target — append after the existing .btn-danger:hover rule at index.css:148 */
.btn { transition: background var(--dur-fast) var(--ease-out),
                   border-color var(--dur-fast) var(--ease-out),
                   transform var(--dur-fast) var(--ease-out); }

.btn:active:not(:disabled) { transform: scale(0.97); }

.btn-primary:active:not(:disabled)   { background: var(--green-800); }
.btn-secondary:active:not(:disabled) { background: var(--surface-2); }
.btn-gold:active:not(:disabled)      { background: var(--gold-500); filter: brightness(0.94); }
.btn-danger:active:not(:disabled)    { background: var(--red-700); filter: brightness(0.94); }

@media (prefers-reduced-motion: reduce) {
  .btn:active:not(:disabled) { transform: none; }
}
```

`scale(0.97)` and `150ms ease-out` are the audit's press-feedback values. The
`:not(:disabled)` guard mirrors the existing hover rules exactly.

## Repo conventions to follow

- Button variants live together in the `@layer components` block of
  `frontend/src/index.css`, one line per variant, each guarded with
  `:not(:disabled)` — imitate `index.css:138`.
- `--green-800` (`index.css:12`), `--surface-2`, `--gold-500` (`index.css:19`) and
  `--red-700` all already exist. There is NO `--red-800` token — do not invent one;
  the danger variant darkens `--red-700` with `filter: brightness(0.94)` instead.
- Reduced-motion blocks are plain `@media (prefers-reduced-motion: reduce)` at the
  top level — see `index.css:485`.

## Steps

1. In `frontend/src/index.css`, replace the `transition:` line inside `.btn`
   (line 132) with the three-property transition from the Target section.
2. Directly after `.btn-danger:hover:not(:disabled)` (line 148), add the
   `.btn:active` and four variant `:active` rules.
3. Add the `prefers-reduced-motion` block from the Target section at the end of the
   same `@layer components` block.
4. Do not touch `.bottomnav-item:active` (line 362) — a separate plan retires it.

## Boundaries

- Do NOT add `:active` styling to `.field-input`, `.topnav-*`, `.dsh-nav a`, or any
  other selector — buttons only.
- Do NOT change markup, class names, or any JSX file.
- Do NOT change the hover rules.
- Do NOT add dependencies.
- If `.btn` no longer matches the excerpt above (drift since bbf9324), STOP and report.

## Verification

- **Mechanical**: from `frontend/`, `npx tsc --noEmit` and `npm run build` must pass.
- **Feel check**: run the app, open any form with a Save button.
  - With a mouse: press and hold — the button must dip slightly and darken, and
    spring back on release. The dip must be barely perceptible, not a bounce.
  - In DevTools device emulation (iPhone SE / 375px), tap a button — the press
    state must appear on touch, not only on hover.
  - In the DevTools Animations panel at 10% playback, confirm the scale settles at
    0.97 and returns to 1 with no overshoot.
  - In the Rendering panel set `prefers-reduced-motion: reduce` — the colour step
    must remain, the scale must not happen.
  - Confirm a disabled button does not dip or darken.
- **Done when**: every `.btn` variant has a visible press state on touch, and the
  build passes.
