// Numbered "Notes and sources" block placed at the foot of a report section,
// so caveats read as footnotes instead of small print scattered through the UI.
export default function ReportNotes({ items = [], french = false }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return <div className="pbd-notes">
    <h3>{french ? 'Notes et sources' : 'Notes and sources'}</h3>
    <ol>{list.map((item, i) => <li key={i}>{item}</li>)}</ol>
  </div>;
}
