// Group only by recorded ancestry; keep unrelated projects and unlinked rows separate.
export function frameworkGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const node = row.path.find(n => n.node_type === 'outcome')
      || row.path.find(n => n.node_type === 'output')
      || row.path.find(n => n.node_type === 'component') || row.node;
    const key = `${row.project.id}:${node?.id || 'unlinked'}`;
    if (!groups.has(key)) groups.set(key, { key, project: row.project, node, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
