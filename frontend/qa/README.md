# QA harnesses

Browser-driven checks that cover what `npm test` cannot: the portal as a user
meets it. They run against the built bundle with the Supabase API stubbed from
`fixture.json`, so no real database is touched and destructive controls (delete,
approve) are safe to press.

## Running them

```sh
npm run build
npx vite preview --port 5199 --strictPort &      # serve the built bundle
export STUB_FILE=qa/fixture.json

node qa/sweep-controls.mjs      # click every control on every route
node qa/permission-matrix.mjs   # which routes each role may reach
node qa/auth-lifecycle.mjs      # sign-in, sign-out, back button, deep links
node qa/data-and-ux.mjs         # KPI reconciliation, filters, map, export, responsive, a11y
```

## What each one is for

**`sweep-controls.mjs`** — visits every route, finds every visible enabled
button, link and tab, and clicks it. Reports console errors, uncaught page
errors, blank pages and failed requests. This is what catches a control that
looks alive but throws, which a static scan cannot see.

**`permission-matrix.mjs`** — signs in as each of the five roles and tries every
route by direct URL, printing a reached/redirected grid. The point is that
hiding a sidebar entry is not access control: the route has to turn the user
away too.

**`auth-lifecycle.mjs`** — seeds a session **once** and never again. This
matters: `addInitScript` runs on every navigation, so a harness that injects the
token that way silently signs the user back in after sign-out and makes the back
button look like a security hole. Ask how the harness seeds state before
believing an auth finding.

**`data-and-ux.mjs`** — the fixture holds values chosen so every KPI can be
worked out by hand (two projects, 1,000,000 + 160,000,000 VUV, one 300,000
expenditure record, one 120-person beneficiary record). The assertions are those
hand calculations, so a wrong number fails rather than being copied.

## Two things worth knowing

Google Fonts and the `unpkg` leaflet stylesheet fail to load in a sandbox and
are filtered out of the network results — they are pre-existing external assets,
not application faults.

Server-side permission enforcement is **not** testable here, because the stub
answers whatever it is asked. That belongs in SQL against the real database,
impersonating a role through `request.jwt.claims` and confirming RLS returns
only the rows that role may see.
