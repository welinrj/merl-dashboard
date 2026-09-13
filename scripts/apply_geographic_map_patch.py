from pathlib import Path

path = Path('frontend/src/pages/Dashboards.jsx')
text = path.read_text()

old_import = "import FilterBar from '../components/ui/FilterBar';\n"
new_import = "import FilterBar from '../components/ui/FilterBar';\nimport GeographicCoverageMap from '../components/GeographicCoverageMap';\n"
if old_import not in text:
    raise SystemExit('FilterBar import marker not found')
text = text.replace(old_import, new_import, 1)

old = """      <MetricStrip title=\"Area Council Coverage & Feasibility\" items={[\n        { label: 'Area Councils covered', value: activeAreas.length },\n        { label: 'Provinces', value: province ? 1 : provinceCounts.length },\n        { label: 'Feasibility confirmed', value: activeAreas.filter((a) => a.feasibility_status === 'confirmed').length },\n        { label: 'Under assessment', value: activeAreas.filter((a) => a.feasibility_status === 'under_assessment').length },\n        { label: 'Conditional', value: activeAreas.filter((a) => a.feasibility_status === 'conditional').length },\n        { label: 'Not feasible', value: activeAreas.filter((a) => a.feasibility_status === 'not_feasible').length },\n      ]} />\n\n      <div className=\"db-2\">\n"""
new = """      <MetricStrip title=\"Area Council Coverage & Feasibility\" items={[\n        { label: 'Area Councils covered', value: activeAreas.length },\n        { label: 'Provinces', value: province ? 1 : provinceCounts.length },\n        { label: 'Feasibility confirmed', value: activeAreas.filter((a) => a.feasibility_status === 'confirmed').length },\n        { label: 'Under assessment', value: activeAreas.filter((a) => a.feasibility_status === 'under_assessment').length },\n        { label: 'Conditional', value: activeAreas.filter((a) => a.feasibility_status === 'conditional').length },\n        { label: 'Not feasible', value: activeAreas.filter((a) => a.feasibility_status === 'not_feasible').length },\n      ]} />\n\n      <GeographicCoverageMap areas={activeAreas} projects={d.projects} province={province} />\n\n      <div className=\"db-2\">\n"""
if old not in text:
    raise SystemExit('Geographic insertion marker not found')
text = text.replace(old, new, 1)

path.write_text(text)
