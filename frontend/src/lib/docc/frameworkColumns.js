export const FRAMEWORK_COLUMNS = [
  { key: 'objective', label: 'Project objective / strategic results' },
  { key: 'component', label: 'Component' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'output', label: 'Output' },
];

// Classify the recorded ancestry without inventing missing levels or changing
// parent relationships. Less common strategic nodes remain visible.
export function frameworkColumns(path) {
  const columns = Object.fromEntries(FRAMEWORK_COLUMNS.map(({ key }) => [key, []]));
  for (const node of path) {
    const key = node.node_type === 'component' ? 'component'
      : node.node_type === 'outcome' ? 'outcome'
      : ['output', 'sub_output'].includes(node.node_type) ? 'output' : 'objective';
    columns[key].push(node);
  }
  return columns;
}
