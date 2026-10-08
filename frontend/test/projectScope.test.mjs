import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProjects, currentProjects, officialPortfolioData } from '../src/lib/docc/projectScope.js';
import { projectMatches } from '../src/lib/dashboardFilters.jsx';
import { enrichPublishedProject } from '../src/lib/publicSnapshot.js';
const projects = [{id:'a',code:'A',status:'active'}, {id:'b',code:'B',status:'planning'}, {id:'c',code:'C',status:'completed'}, {id:'t',code:'AUDIT-2026',status:'pipeline'}];
test('official register reconciles to current plus completed, excluding the fixture', () => {
  assert.equal(officialProjects(projects).length,3);
  assert.deepEqual(currentProjects(projects).map(p=>p.id),['a','b']);
  assert.equal(projectMatches(projects[3], {}),false);
});
test('official portfolio excludes fixture results, activities and expenditure together', () => {
  const data=officialPortfolioData({projects,activities:[{project_id:'a'},{project_id:'t'}],financial:[{project_id:'t'}]});
  assert.equal(data.projects.length,3);
  assert.equal(data.activities.length,1);
  assert.equal(data.financial.length,0);
});
test('missing published fields remain missing rather than acquiring a different public profile', () => {
  const p={code:'24B298',project_manager:null,coverage_type:null};
  assert.deepEqual(enrichPublishedProject(p),p);
});
