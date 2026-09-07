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
  s = replace(s, "    ?? (location.pathname === '/analytics/project-portfolio' ? NAV_ITEMS.find(n => n.key === 'overview') : undefined)", "    ?? (location.pathname === '/analytics/project-portfolio' ? NAV_ITEMS.find(n => n.key === 'projectAnalysis') : undefined)");
  s = replace(s, "  const gate = (path: string) => allowed.includes(ROUTE_GATE[path]);", "  const gate = (path: string) => allowed.includes(ROUTE_GATE[path]);");
  return s;
});
console.log('Restored Project Portfolios navigation.');
