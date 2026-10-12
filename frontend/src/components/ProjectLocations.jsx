// Profile locations remain useful even when no separate Area Council rows exist.
export default function ProjectLocations({ project, areaCouncils = [], error, onRetry }) {
  const names = values => [...new Set((values || []).map(value => String(value).trim()).filter(Boolean))];
  const councils = names([
    ...(project?.area_councils || []),
    ...areaCouncils.filter(row => row.coverage_status !== 'not_covered').map(row => row.area_council_name || ''),
  ]);
  const groups = [
    ['Provinces', names(project?.provinces)],
    ['Islands', names(project?.islands)],
    ['Area Councils', councils],
    ['Communities', names(project?.communities)],
  ];
  const recorded = groups.some(([, values]) => values.length > 0);
  return <div style={{ fontSize: '1rem', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
    {error && <div role="alert"><p>Area Council details could not be loaded. {error}</p><button className="btn btn-secondary" onClick={onRetry}>Try again</button></div>}
    {recorded ? <dl style={{ margin: 0 }}>
      {groups.map(([label, values]) => <div key={label} style={{ marginBottom: '1rem' }}>
        <dt style={{ fontWeight: 700 }}>{label}</dt>
        <dd style={{ margin: '0.25rem 0 0', color: values.length ? 'var(--text)' : 'var(--text-3)' }}>
          {values.length ? values.join(', ') : label === 'Area Councils' && error ? 'Could not load separate records' : 'Not yet recorded'}
        </dd>
      </div>)}
    </dl> : !error && <p>No project locations recorded</p>}
    <p style={{ color: 'var(--text-3)', marginBottom: 0 }}>To add or correct locations, open Projects, choose this project, then select Edit in Locations.</p>
  </div>;
}
