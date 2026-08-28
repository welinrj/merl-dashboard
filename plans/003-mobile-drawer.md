# 003 — Fix the mobile sidebar drawer and its backdrop

- **Status**: TODO
- **Commit**: bbf9324
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion
- **Estimated scope**: 2 files, ~15 lines
- **Depends on**: 001 (uses `--ease-drawer`)

## Problem

Below 760px the sidebar becomes the portal's primary navigation. The panel slides,
but its backdrop does not — it is conditionally mounted, so it hard-cuts in and
out while the panel takes 200ms to travel:

```jsx
/* frontend/src/App.tsx:464 — current */
{sidebarOpen && <div className="dsh-overlay" onClick={() => setSidebarOpen(false)} />}
```

```css
/* frontend/src/index.css:784 — current */
.dsh-side { position: fixed; z-index: 60; height: 100dvh; transform: translateX(-100%); transition: transform .2s ease; box-shadow: var(--shadow-lg); }
.dsh-side.open { transform: translateX(0); }
.dsh-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 55; }
```

Two defects:

1. **The scrim pops.** A 35% black sheet appears instantly over the whole screen,
   then the panel slides in behind it. On close it vanishes before the panel has
   finished leaving. This is the most-used interaction on the most-used device.
2. **`ease` is the wrong curve.** A drawer entering from off-screen should start
   fast and settle — bare `ease` starts slow, so the panel feels heavier than it is.

The panel itself correctly animates `transform` (composited) and uses a CSS
transition rather than keyframes, so it is already interruptible — that part is
right and must not be changed.

## Target

Keep the overlay mounted whenever the drawer has been opened and fade it with the
panel. Because `.dsh-overlay` is currently mounted conditionally, it needs an
`open` class rather than a mount toggle:

```jsx
/* frontend/src/App.tsx:464 — target */
<div
  className={`dsh-overlay${sidebarOpen ? ' open' : ''}`}
  onClick={() => setSidebarOpen(false)}
  aria-hidden={!sidebarOpen}
/>
```

```css
/* frontend/src/index.css:784 — target (inside the existing @media (max-width: 760px)) */
.dsh-side {
  position: fixed; z-index: 60; height: 100dvh;
  transform: translateX(-100%);
  transition: transform var(--dur-base) var(--ease-drawer);
  box-shadow: var(--shadow-lg);
}
.dsh-side.open { transform: translateX(0); }

.dsh-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 55;
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur-base) var(--ease-drawer);
}
.dsh-overlay.open { opacity: 1; pointer-events: auto; }
```

`pointer-events: none` is load-bearing: the overlay is now always in the DOM and
would otherwise swallow every click on the page when closed.

Outside the 760px breakpoint `.dsh-overlay` must not cover anything. Confirm the
base (non-media-query) `.dsh-overlay` rule — if one exists outside the media
query, give it the same `opacity: 0; pointer-events: none;` default.

## Repo conventions to follow

- The `.open` class pattern is already how this shell works — imitate
  `frontend/src/App.tsx:467`:
  `<aside className={`dsh-side${sidebarOpen ? ' open' : ''}`}>`.
- Mobile shell rules live inside `@media (max-width: 760px)` in
  `frontend/src/index.css` (starts line 783). Keep the changes in that block.
- `--shadow-lg` and `--dur-base` / `--ease-drawer` (added by plan 001) are the only
  tokens needed; do not hand-type a cubic-bezier.

## Steps

1. In `frontend/src/index.css`, inside `@media (max-width: 760px)`, replace the
   `.dsh-side` rule's `transition` with `transform var(--dur-base) var(--ease-drawer)`.
2. In the same block, replace the `.dsh-overlay` rule with the target version and
   add the `.dsh-overlay.open` rule.
3. Search the whole file for any other `.dsh-overlay` rule outside the media query.
   If one exists, add `opacity: 0; pointer-events: none;` to it as well.
4. In `frontend/src/App.tsx`, replace line 464 with the target JSX — the overlay is
   now always rendered and toggles via the `open` class.

## Boundaries

- Do NOT change `.dsh-side.open`, the panel's `transform` values, or its `z-index`.
- Do NOT convert the transition to keyframes or add a motion library.
- Do NOT change the hamburger button, `.dsh-nav`, or any other shell element.
- Do NOT change `sidebarOpen` state logic or add an exit-animation timer in JS —
  the CSS transition handles both directions.
- Do NOT add dependencies.
- If `App.tsx:464` or the `.dsh-side` rule no longer matches the excerpts above,
  STOP and report.

## Verification

- **Mechanical**: from `frontend/`, `npx tsc --noEmit` and `npm run build` must pass.
- **Feel check**: run the app, DevTools device emulation at 375px wide.
  - Tap the hamburger: the scrim must **fade** in over the same 200ms the panel
    slides — no instant black flash.
  - Tap the scrim to close: scrim and panel must leave together; the scrim must not
    disappear first.
  - Spam the hamburger open/closed rapidly: the panel must retarget smoothly from
    wherever it is, never jump back to fully-closed and restart.
  - **Critical regression check**: with the drawer closed, click buttons and links
    across the page at 375px AND at desktop width. Everything must remain
    clickable — if anything is dead, `pointer-events: none` was not applied.
  - In the Animations panel at 10% playback, confirm the panel starts fast and
    decelerates (it must not creep at the start).
- **Done when**: scrim and panel animate as one, nothing on the page is
  click-blocked when the drawer is closed, and the build passes.
