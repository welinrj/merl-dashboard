import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProjects, currentProjects, isCurrentPortfolioProject, officialPortfolioData } from '../src/lib/docc/projectScope.js';
import { projectMatches } from '../src/lib/dashboardFilters.jsx';
import { enrichPublishedProject } from '../src/lib/publicSnapshot.js';
const projects = [{id:'a',code:'A',status:'active',has_results_framework:true}, {id:'b',code:'B',status:'planning',has_results_framework:false}, {id:'c',code:'C',status:'completed',has_results_framework:true}, {id:'t',code:'AUDIT-2026',status:'pipeline'}, {id:'x',code:'X',status:'active',has_results_framework:true,excluded_from_current_portfolio:true}];
test('official register keeps archived projects and excludes the fixture', () => {
  assert.equal(officialProjects(projects).length,4);
  assert.deepEqual(currentProjects(projects).map(p=>p.id),['a']);
  assert.equal(projectMatches(projects[3], {}),false);
});
test('official portfolio excludes fixture results, activities and expenditure together', () => {
  const data=officialPortfolioData({projects,activities:[{project_id:'a'},{project_id:'t'}],financial:[{project_id:'t'}]});
  assert.equal(data.projects.length,1);
  assert.equal(officialPortfolioData({projects}, true).projects.length,1);
  assert.equal(data.activities.length,1);
  assert.equal(data.financial.length,0);
});
test('missing published fields remain missing rather than acquiring a different public profile', () => {
  const p={code:'24B298',project_manager:null,coverage_type:null};
  assert.deepEqual(enrichPublishedProject(p),p);
});

test('framework scope excludes archived and completed projects and requires framework records', () => {
  assert.deepEqual(currentProjects([...projects, {id:'missing',code:'M',status:'active'}]).map(p => p.id), ['a']);
  assert.equal(projectMatches(projects[1], {}), false);
  assert.equal(projectMatches(projects[2], {}), false);
  assert.equal(projectMatches(projects[4], {}), false);
  assert.equal(isCurrentPortfolioProject(projects[1]), true);
  assert.equal(isCurrentPortfolioProject(projects[4]), false);
  const scoped = officialPortfolioData({projects, financial: [{project_id:'a'}, {project_id:'b'}, {project_id:'x'}], progress: [{project_id:'b'}]});
  assert.deepEqual(scoped.financial, [{project_id:'a'}]);
  assert.deepEqual(scoped.progress, []);
});
