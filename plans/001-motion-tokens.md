# 001 — Add motion tokens to :root

- **Status**: DONE
- **Commit**: bbf9324
- **Severity**: LOW (enabling — plans 002–004 consume these tokens)
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, ~6 added lines

## Problem

`frontend/src/index.css` tokenises colour, radius and shadow in `:root` but has
**no** easing or duration tokens. Every animated rule hand-types its own values,
producing six different durations and a single weak built-in curve across 14
sites:

```css
/* frontend/src/index.css:97  */  transition: border-color 0.2s ease;
/* frontend/src/index.css:132 */  transition: background 0.15s, border-color 0.15s;
/* frontend/src/index.css:198 */  .data-table tbody tr { transition: background 0.12s; }
/* frontend/src/index.css:784 */  .dsh-side { … transition: transform .2s ease; … }
```

Bare `ease` is CSS's weakest built-in curve. Deliberate UI motion needs stronger
curves, and they should be defined once.

## Target

Add to the existing `:root` block in `frontend/src/index.css`, immediately after
the shadow tokens:

```css
  /* Motion — see plans/README.md. Entrances/exits use --ease-out; on-screen
     movement uses --ease-in-out; drawers use --ease-drawer. */
  --ease-out:     cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer:  cubic-bezier(0.32, 0.72, 0, 1);
  --dur-fast:     150ms;  /* hover, colour change */
  --dur-base:     200ms;  /* dropdowns, drawers */
  --dur-slow:     260ms;  /* modals */
```

This plan **only adds the tokens**. It does not rewrite existing rules — plans
002–004 do that.

## Repo conventions to follow

- All tokens are plain CSS custom properties on `:root` in
  `frontend/src/index.css` (see `--green-600: #0e6e6e;` at `index.css:14` and
  `--radius-control` used at `index.css:129`). Follow that exact style: two-space
  indent, one token per line, aligned values, a short `/* comment */` where the
  intent isn't obvious.
- Tailwind is present but motion here is authored in plain CSS, not the Tailwind
  config. Do **not** add these to `tailwind.config.js`.

## Steps

1. Open `frontend/src/index.css`. Locate the `:root` block (starts near line 10)
   and find the last shadow token in it.
2. Insert the six tokens above directly after that shadow token, keeping the
   file's two-space indentation.
3. Change nothing else.

## Boundaries

- Do NOT modify any existing `transition:` or `animation:` declaration in this plan.
- Do NOT add these tokens to `tailwind.config.js` or any component file.
- Do NOT add dependencies.
- If `:root` does not look as described (drift since commit bbf9324), STOP and report.

## Verification

- **Mechanical**: from `frontend/`, run `npx tsc --noEmit` and `npm run build`.
  Both must pass. CSS custom properties cannot break either, so any failure means
  something unrelated was touched — revert and report.
- **Feel check**: none. This plan changes no rendered motion; the app must look and
  behave exactly as before.
- **Done when**: `grep -c "^\s*--ease-\|^\s*--dur-" frontend/src/index.css` returns `6`,
  and the build passes.
