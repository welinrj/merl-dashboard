// Parent information is already repeated in each descendant's framework path.
// Keep only unattached leaf nodes as standalone rows so components do not look
// like empty results ahead of their recorded outputs and indicators.
export function standaloneFrameworkNodes(nodes, indicators) {
  const represented = new Set(indicators.map(i => i.framework_node_id).filter(Boolean));
  const parents = new Set(nodes.map(n => n.parent_node_id).filter(Boolean));
  return nodes.filter(n => !represented.has(n.id) && !parents.has(n.id));
}
