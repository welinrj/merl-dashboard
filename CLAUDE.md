# MERL Dashboard — contributor guide

## Architecture / caching

- The frontend is a static SPA that talks directly to (self-hosted) Supabase
  (PostgREST). Expensive **organisation-wide aggregates** (Analysis / Dashboard)
  are cached in two layers so they aren't recomputed per user:
  1. **DB materialized view** `merl.mv_srf_analytics` (exposed as
     `public.v_srf_analytics`), auto-refreshed by a trigger on
     `merl.srf_activities` and via `public.refresh_analytics_cache()`.
  2. **Redis caching sidecar** (`cache-service/`, added to `docker-compose.yml`,
     routed at `/api-cache/*` in `nginx/nginx.conf`) serving that view from Redis.
- Read shared aggregates through `frontend/src/lib/cachedRead.js`
  (`cachedRead(name, fallback)`), which tries the sidecar and **falls back**
  gracefully (DB view → client compute) so the UI works with or without Redis
  (e.g. Supabase Cloud staging has no sidecar). Only non-sensitive aggregates go
  through the cache; row-level RLS-protected data stays on the direct Supabase
  path with the user's token — never cache per-user data in the shared cache.

## Frontend

- App lives in `frontend/` (Vite + React 18 + TypeScript, `.tsx`/`.jsx`). Build/typecheck with `cd frontend && npm run build` and `npx tsc --noEmit` before committing.
- Styling: Tailwind 3 (`@tailwind` directives in `src/index.css`, tokens as CSS custom properties in `:root`) plus inline styles on the pages. Shared UI primitives live in `src/components/ui/`; the `cn` helper is in `src/lib/utils.ts`; the `@/*` alias maps to `src/`.

## Mobile-friendly and professional on every screen — REQUIRED

Every change must look and work well on phones **and** desktop. Treat mobile
as a first-class target, not an afterthought — the portal is used on phones in
the field. When you add or change any element or feature, verify it stays
clean and professional across the full range (~360px phone → wide desktop).

Rules to follow:

- **No horizontal overflow.** The page body must never scroll sideways. Any
  wide block (tables, charts, code, wide flex rows) must live inside its own
  `overflow-x: auto` scroll container — see the `overflowX:'auto'` wrappers
  around the `.data-table`s in `Dashboard.jsx`, `ProjectDashboard.jsx`,
  `ProjectFiles.jsx` for the pattern.
- **Responsive layout, not fixed widths.** Prefer the existing grid helpers in
  `index.css` (`.grid-kpi`, `.grid-2`, `.grid-dash-2/3`, `.grid-main-side`,
  `.page-pad`) which already collapse to one column at the `1024/800/640px`
  breakpoints. Multi-column layouts must stack on small screens.
- **Fluid type for large headings.** Use `clamp()` (e.g. the Dashboard title)
  so big display text scales down on phones instead of overflowing.
- **The top nav (`.topnav` in `App.tsx`/`index.css`) is breakpoint-driven.**
  Below 960px the pill links collapse into the hamburger menu; below 768px the
  Staging badge, inline EN/FR toggle, notification bell and account avatar are
  hidden (language, account details and Sign Out move into the mobile menu);
  below 400px the crest/title shrink. If you add header controls, give them the
  same responsive treatment — never let the header exceed one row on a phone.
- **Phones get a bottom tab bar (`.bottomnav`).** Below 768px a fixed bottom
  navigation shows the first primary destinations plus a "More" button that
  opens the full menu. It's a flex sibling of `<main>` in the `.app-shell`
  column so it pins to the bottom without overlapping scroll content. Keep it in
  sync if you change the primary nav.
- **Wide tables become cards on phones.** Below 768px the `.data-table`s are
  hidden and a stacked card list is shown instead (see `.activities-cards` /
  `.activity-card` in `StrategicActivities.jsx` + `index.css`). Any new wide
  table should follow the same table-on-desktop / cards-on-mobile pattern rather
  than only relying on horizontal scroll.
- **Inline styles can't be overridden by media queries.** If a value must
  change at a breakpoint, put it in a CSS class (not an inline `style`), so a
  `@media` rule can win. Inline styles always beat stylesheet rules.
- **Tap targets** should be ≥ ~40px on touch, and interactive controls need
  visible focus states (the global `:focus-visible` ring already provides one).

When in doubt, mentally check the design at 360px wide and at desktop width
before committing.
