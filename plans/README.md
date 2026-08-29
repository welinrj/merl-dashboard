# Animation plans — MERL Dashboard

Produced by the `improve-animations` skill against commit `bbf9324`.
Read-only audit: no source file was modified. Each plan is self-contained — an
executor needs no context beyond the plan itself.

## Plans

| # | Title | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| [001](001-motion-tokens.md) | Add motion tokens to `:root` | LOW (enabling) | Cohesion & tokens | **DONE** |
| [002](002-touch-press-feedback.md) | Give buttons a press state for touch | **HIGH** | Purpose / Physicality | **DONE** |
| [003](003-mobile-drawer.md) | Fix the mobile sidebar drawer and its backdrop | MEDIUM | Easing / Cohesion | **DONE** |
| [004](004-skeleton-shimmer.md) | Unify the two skeleton shimmers and make them linear | MEDIUM | Easing / Cohesion / A11y | **DONE** |
| [005](005-retire-dead-motion.md) | Retire dead animation code | MEDIUM | Purpose & frequency | **DONE** |

## Status

All five plans are applied. 001–004 landed first (the user-visible motion
fixes); 005 followed separately because it deletes unreachable code and two
dependencies and changes nothing on screen, so it did not belong in the same
diff as the visible changes.

Removing `.dash-hero*` in 005 also removed the codebase's only
`prefers-reduced-motion` block — which is fine, because it guarded an element
no JSX renders. The two real ones added by 002 and 004 are what now provides
actual reduced-motion coverage.

One deviation from plan 003 as written: the plan did not account for
`.dsh-overlay` being defined *only* inside `@media (max-width: 760px)`. Keeping
the element mounted at all widths would have put an unstyled block into the
desktop layout, so a base `.dsh-overlay { display: none; }` rule was added
outside the media query and `display: block` set inside it.

## Recommended order

```
001 ──┬── 002   (highest user-visible impact; do this first after tokens)
      ├── 003
      └── 004

005   (independent — can run any time, including first)
```

- **001 must land before 002, 003 and 004** — they consume `--ease-out`,
  `--ease-drawer`, `--dur-fast` and `--dur-base`. Plan 004 adds `--dur-shimmer`
  next to them.
- **005 is independent** of everything else. It touches only unreachable files and
  dead CSS, and is the one plan that changes `package.json` / `package-lock.json`.
  Landing it separately keeps the lockfile churn out of the motion diffs.
- 002, 003 and 004 do not overlap: 002 is buttons, 003 is the mobile drawer, 004 is
  skeletons. They can be executed in parallel or in any order once 001 is in.

## What the audit did NOT flag

Recorded so these don't get "fixed" later by mistake:

- **`GlobalSearch.jsx` has no open/close animation** — correct. A command palette is
  a 100+/day keyboard-initiated surface; the audit rule is no animation, ever.
- **`.dsh-nav a` hover has no transition** — correct. Primary nav is hit constantly;
  instant colour feedback is the right call.
- **Cards and buttons don't lift on hover** — deliberate. `index.css:99` and
  `index.css:106` document "no lift" / "no float / lift" as the house style.
- **No `ease-in` anywhere in the codebase** — the most common animation defect is
  simply absent here.
- **`react-hot-toast` default animations** (`main.jsx:42`) — library-managed, not
  repo code, and toasts are an occasional surface.

## Known stale documentation (not an animation finding)

`CLAUDE.md` documents `.topnav` and `.bottomnav` as the current shell — breakpoint
pill nav collapsing to a hamburger, plus a phone bottom tab bar. No JSX renders
either class; the live shell is the `.dsh-*` navy sidebar (`App.tsx:464–492`). The
CSS for both survives in `index.css` (247–362). Worth reconciling, but it is a
documentation/architecture decision, not motion work — see the Boundaries section
of plan 005.
