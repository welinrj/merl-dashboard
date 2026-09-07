import fs from 'node:fs';
const root = 'frontend/src/';
function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No change made to ${path}`);
  fs.writeFileSync(path, after);
}
function replace(source, oldText, newText) {
  if (!source.includes(oldText)) throw new Error(`Missing expected source: ${oldText.slice(0, 100)}`);
  return source.replace(oldText, newText);
}
edit(root + 'App.tsx', (source) => {
  let s = replace(source, "  { key: 'results', path: '/analytics/results', Icon: Target },", "  { key: 'results', path: '/analytics/results', Icon: Target },\n  { key: 'projectAnalysis', path: '/analytics/project-portfolio', Icon: ProjectAnalysis },");
  s = replace(s, "  ROLE_VIEWER:       ['overview', 'projects', 'results', 'reports'],", "  ROLE_VIEWER:       ['overview', 'projects', 'projectAnalysis', 'results', 'reports'],");
  s = replace(s, "    ?? (location.pathname === '/analytics/project-portfolio' ? NAV_ITEMS.find(n => n.key === 'overview') : undefined)", "    ?? (location.pathname === '/analytics/project-portfolio' ? NAV_ITEMS.find(n => n.key === 'projectAnalysis') : undefined)");
  return s;
});
edit(root + 'pages/ProjectPortfolioAnalysis.jsx', (source) => {
  let s = replace(source, "  const period = params.get('period') ?? '';", "  const period = params.get('period') ?? '';\n  const focus = params.get('focus') ?? '';\n  const focusRecord = params.get('record') ?? '';\n  const handledFocus = useRef('');");
  s = replace(s, "  const geo = useMemo(() => geographicSummary(d.locations, d.activities), [d]);", `  const geo = useMemo(() => geographicSummary(d.locations, d.activities), [d]);

  // Global search opens the owning project and the relevant record/section.
  // Keep the URL context so Back and refresh remain meaningful.
  useEffect(() => {
    if (!projectId || loading || !d.project || !focus) return;
    const key = [projectId, focus, focusRecord, period].join(':');
    if (handledFocus.current === key) return;
    handledFocus.current = key;
    if (focus === 'indicator') {
      const entry = a.results.rows.find(r => r.indicator.id === focusRecord);
      if (entry) setIndicator(entry);
      else jump('ppa-results');
    } else {
      const section = ['objective', 'outcome', 'output'].includes(focus) ? 'ppa-results' : focus === 'activity' ? 'ppa-implementation' : null;
      if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
    }
  }, [projectId, focus, focusRecord, period, loading, d.project, a.results.rows]);`);
  return s;
});
console.log('Restored Project Portfolios and connected global search to project context.');
