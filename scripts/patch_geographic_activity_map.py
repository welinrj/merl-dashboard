from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)

p = Path('frontend/src/pages/Dashboards.jsx')
s = p.read_text()
s = rep(s,
"q('v_project_activities', 'project_id, code, name, status, physical_progress_pct, output_code'),",
"q('v_project_activities', 'project_id, code, name, status, physical_progress_pct, output_code, province, island, area_council, community'),",
'activity query')
s = rep(s,
'<GeographicCoverageMap areas={activeAreas} projects={d.projects} province={province} />',
'<GeographicCoverageMap areas={activeAreas} projects={d.projects} activities={d.activities} province={province} />',
'map props')
p.write_text(s)

p = Path('frontend/src/components/GeographicCoverageMap.jsx')
s = p.read_text()

s = rep(s, """const BREAKS = [
  { min: 0, max: 0, label: '0', color: '#eef3f7' },
  { min: 1, max: 1, label: '1', color: '#a7dfc3' },
  { min: 2, max: 3, label: '2–3', color: '#55b8a7' },
  { min: 4, max: 5, label: '4–5', color: '#318aa8' },
  { min: 6, max: Infinity, label: '6+', color: '#185b7d' },
];

const ALIASES = new Map([
  ['west santo', ['west coast santo']],
  ['big bay coast', ['big bay inland', 'big bay']],
]);""", """const BREAKS = [
  { min: 0, max: 0, label: '0', color: '#f1f5f9' },
  { min: 1, max: 1, label: '1', color: '#ffd43b' },
  { min: 2, max: 3, label: '2–3', color: '#ff922b' },
  { min: 4, max: 5, label: '4–5', color: '#f03e3e' },
  { min: 6, max: Infinity, label: '6+', color: '#7b2cbf' },
];

// Published project names are canonical. The boundary service uses an older
// administrative naming set, so only explicit, audited aliases are allowed.
// Do not use fuzzy cross-island matching: it can place a project in the wrong AC.
const ALIASES = new Map([
  ['yarsu', ['south epi', 'epi']],
  ['west coast santo', ['west santo', 'west coast']],
  ['big bay inland', ['big bay', 'big bay coast']],
  ['south maewo', ['maewo']],
  ['south tanna', ['south west tanna']],
  ['west ambrym', ['west ambrym']],
  ['futuna', ['futuna']],
  ['torres', ['torres']],
  ['mota', ['mota']],
]);""", 'palette and aliases')

s = rep(s, """function projectName(project) {
  if (!project) return 'Unknown project';
  return project.code ? `${project.code} — ${project.name}` : project.name;
}

function aggregateAreas(areas, projects) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));""", """function projectName(project) {
  if (!project) return 'Unknown project';
  return project.code ? `${project.code} — ${project.name}` : project.name;
}

const activityStarted = (activity) => !['not_started', 'cancelled'].includes(String(activity?.status || '').toLowerCase());
const activityLabel = (activity) => {
  const status = String(activity?.status || 'not reported').replaceAll('_', ' ');
  const progress = activity?.physical_progress_pct == null ? '' : ` · ${activity.physical_progress_pct}%`;
  const where = [activity?.community, activity?.island].filter(Boolean).join(', ');
  return `${activity?.code ? `${activity.code} — ` : ''}${activity?.name || 'Activity'} · ${status}${progress}${where ? ` · ${where}` : ''}`;
};

function sameArea(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aa = ALIASES.get(a) || [];
  const bb = ALIASES.get(b) || [];
  return aa.includes(b) || bb.includes(a);
}

function aggregateAreas(areas, projects, activities) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));""", 'activity helpers')

s = rep(s, """  return [...grouped.values()].map((item) => ({ ...item, project_count: item.projectIds.size }));
}""", """  return [...grouped.values()].map((item) => {
    const areaActivities = activities.filter((activity) =>
      item.projectIds.has(activity.project_id)
      && normProvince(activity.province) === normProvince(item.province)
      && sameArea(activity.area_council, item.area));
    const implemented = areaActivities.filter(activityStarted);
    return {
      ...item,
      project_count: item.projectIds.size,
      activities: areaActivities,
      implemented_activities: implemented,
      activity_count: implemented.length,
    };
  });
}""", 'aggregate activity data')

# Replace unsafe fuzzy fallback with strict audited alias matching only.
s = rep(s, """  return sameProvince.find((record) => {
    const candidate = norm(record.area);
    return areaKey.length >= 4 && candidate.length >= 4 && (areaKey.includes(candidate) || candidate.includes(areaKey));
  }) || null;
}""", """  return null;
}""", 'remove fuzzy site matching')

s = rep(s,
"export default function GeographicCoverageMap({ areas = [], projects = [], province = '' }) {",
"export default function GeographicCoverageMap({ areas = [], projects = [], activities = [], province = '' }) {",
'component props')
s = rep(s,
"  const [basemap, setBasemap] = useState('streets');\n\n  const aggregated = useMemo(() => aggregateAreas(areas, projects), [areas, projects]);",
"  const [basemap, setBasemap] = useState('streets');\n  const [metric, setMetric] = useState('projects');\n\n  const aggregated = useMemo(() => aggregateAreas(areas, projects, activities), [areas, projects, activities]);\n  const mappedProjectIds = useMemo(() => new Set(areas.filter((a) => a.coverage_status !== 'not_covered').map((a) => a.project_id).filter(Boolean)), [areas]);\n  const mappedActivityCount = useMemo(() => aggregated.reduce((n, row) => n + row.activity_count, 0), [aggregated]);",
'metric state')

s = rep(s,
"          const count = rec?.project_count || 0;",
"          const count = metric === 'activities' ? (rec?.activity_count || 0) : (rec?.project_count || 0);",
'style metric')

old_popup = """          const count = rec?.project_count || 0;
          const names = rec?.projects?.map(projectName) || [];
          layer.bindTooltip(`${esc(areaName)} · ${count} ${count === 1 ? 'project' : 'projects'}`, { sticky: true });
          layer.bindPopup(`<strong>${esc(areaName)}</strong><br><span style=\"color:#64748b\">${esc(provinceName)}</span><div style=\"margin-top:6px\"><b>${count}</b> ${count === 1 ? 'project' : 'projects'}</div>${names.length ? `<ul style=\"padding-left:16px;margin:6px 0 0\">${names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul>` : '<div style=\"margin-top:6px;color:#64748b\">No project coverage record for this Area Council.</div>'}`);

          const centre = layer.getBounds?.().getCenter?.();
          if (centre && count && stateRef.current.sites) {
            const marker = L.circleMarker(centre, {
              radius: Math.min(9, 5 + Math.sqrt(count)),
              color: '#ffffff', weight: 2, fillColor: '#1264d7', fillOpacity: 1,
            });
            marker.bindTooltip(`${esc(areaName)} · ${count} ${count === 1 ? 'project' : 'projects'}`);
            marker.bindPopup(`<strong>${esc(areaName)}</strong><br>${names.map((name) => esc(name)).join('<br>')}`);
            marker.addTo(markerLayer);
          }"""
new_popup = """          const projectCount = rec?.project_count || 0;
          const activityCount = rec?.activity_count || 0;
          const names = rec?.projects?.map(projectName) || [];
          const areaActivities = rec?.implemented_activities || [];
          const metricCount = metric === 'activities' ? activityCount : projectCount;
          const metricWord = metric === 'activities' ? (metricCount === 1 ? 'activity' : 'activities') : (metricCount === 1 ? 'project' : 'projects');
          layer.bindTooltip(`${esc(areaName)} · ${metricCount} ${metricWord}`, { sticky: true });
          const groupedActivities = areaActivities.reduce((mapByProject, activity) => {
            const project = rec?.projects?.find((item) => item.id === activity.project_id);
            const label = projectName(project || { name: 'Project record' });
            if (!mapByProject.has(label)) mapByProject.set(label, []);
            mapByProject.get(label).push(activity);
            return mapByProject;
          }, new Map());
          const activityHtml = groupedActivities.size
            ? [...groupedActivities.entries()].map(([project, rows]) => `<div style=\"margin-top:8px\"><b>${esc(project)}</b><ul style=\"padding-left:16px;margin:4px 0 0\">${rows.map((activity) => `<li>${esc(activityLabel(activity))}</li>`).join('')}</ul></div>`).join('')
            : '<div style=\"margin-top:8px;color:#64748b\">No started/completed activity records are linked to this Area Council yet.</div>';
          layer.bindPopup(`<strong>${esc(rec?.area || areaName)}</strong><br><span style=\"color:#64748b\">${esc(provinceName)}</span><div style=\"margin-top:6px\"><b>${projectCount}</b> ${projectCount === 1 ? 'project' : 'projects'} · <b>${activityCount}</b> activities underway/completed</div>${names.length ? `<div style=\"margin-top:8px\"><b>Projects</b><ul style=\"padding-left:16px;margin:4px 0 0\">${names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul></div>` : '<div style=\"margin-top:8px;color:#64748b\">No verified project coverage record for this Area Council.</div>'}<div style=\"margin-top:8px\"><b>Activities being implemented</b>${activityHtml}</div>`);

          const centre = layer.getBounds?.().getCenter?.();
          if (centre && projectCount && stateRef.current.sites) {
            const marker = L.circleMarker(centre, {
              radius: Math.min(10, 5 + Math.sqrt(projectCount)),
              color: '#ffffff', weight: 2, fillColor: '#0b5fff', fillOpacity: 1,
            });
            marker.bindTooltip(`${esc(rec?.area || areaName)} · ${projectCount} ${projectCount === 1 ? 'project' : 'projects'} · ${activityCount} activities`);
            marker.bindPopup(`<strong>${esc(rec?.area || areaName)}</strong><br>${names.map((name) => esc(name)).join('<br>')}<div style=\"margin-top:6px;color:#64748b\">Marker is the Area Council polygon centre, not a GPS activity location.</div>`);
            marker.addTo(markerLayer);
          }"""
s = rep(s, old_popup, new_popup, 'popup content')

s = rep(s,
"  }, [aggregated, province, ready]);",
"  }, [aggregated, province, ready, metric]);",
'map redraw dependencies')

s = rep(s,
".geo-dot{width:9px;height:9px;border-radius:999px;background:#1264d7;display:inline-block}.geo-square{width:10px;height:10px;background:#318aa8;display:inline-block}",
".geo-dot{width:9px;height:9px;border-radius:999px;background:#0b5fff;display:inline-block}.geo-square{width:10px;height:10px;background:#f03e3e;display:inline-block}.geo-audit-note{margin:.65rem 1rem 0;padding:.65rem .75rem;border-radius:8px;background:#fff8e1;border:1px solid #ffe08a;color:#7a4b00;font-size:.74rem}.geo-metric{display:flex;gap:.35rem;margin-top:.5rem}.geo-metric button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:.35rem .62rem;font:700 .7rem system-ui;color:#475569;cursor:pointer}.geo-metric button.active{background:#111827;color:#fff;border-color:#111827}",
'visual styles')

s = rep(s, """          <h3>Vanuatu Area Council Project Sites{province ? ` · ${province}` : ''}</h3>
          <p>Choropleth shows the number of projects by Area Council. Blue markers show Area Council sites with project coverage records.</p>
        </div>""", """          <h3>Vanuatu Area Council Project & Activity Coverage{province ? ` · ${province}` : ''}</h3>
          <p>Area Council polygons use verified coverage records. Point markers show polygon centres for navigation only, not GPS project locations.</p>
          <div className=\"geo-metric\" aria-label=\"Choropleth metric\">
            <button type=\"button\" className={metric === 'projects' ? 'active' : ''} onClick={() => setMetric('projects')} aria-pressed={metric === 'projects'}>Projects</button>
            <button type=\"button\" className={metric === 'activities' ? 'active' : ''} onClick={() => setMetric('activities')} aria-pressed={metric === 'activities'}>Implemented activities</button>
          </div>
        </div>""", 'map header')

s = rep(s,
"      <div className=\"geo-map-wrap\">",
"      <div className=\"geo-audit-note\">Mapped Area Council coverage: <strong>{mappedProjectIds.size}</strong> of <strong>{projects.length}</strong> projects. Activities shown only when a project activity record has an Area Council and its status indicates implementation has started; missing location data is never guessed. <strong>{mappedActivityCount}</strong> such activity records are currently mapped.</div>\n      <div className=\"geo-map-wrap\">",
'audit note')

s = rep(s, """          <strong>Number of projects<br />(by Area Council)</strong>
          {BREAKS.map((item) => <div className=\"geo-legend-row\" key={item.label}><span className=\"geo-legend-swatch\" style={{ background: item.color }} /> <span>{item.label}</span></div>)}
          <hr />
          <div className=\"geo-legend-row\"><span className=\"geo-dot\" /> <span>Project site</span></div>""", """          <strong>{metric === 'activities' ? 'Implemented activities' : 'Projects'}<br />(by Area Council)</strong>
          {BREAKS.map((item) => <div className=\"geo-legend-row\" key={item.label}><span className=\"geo-legend-swatch\" style={{ background: item.color }} /> <span>{item.label}</span></div>)}
          <hr />
          <div className=\"geo-legend-row\"><span className=\"geo-dot\" /> <span>Area Council coverage centre</span></div>""", 'legend')

p.write_text(s)
