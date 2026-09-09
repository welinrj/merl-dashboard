// Form 8 reported breakdowns, with the same direct-reach rule used by all
// portfolio and project reports. Do not turn repeated periods into extra people.
import { portfolioBeneficiaries } from './docc/projectAnalysis.js';

const FIELDS = ['female', 'male', 'other_gender', 'youth', 'persons_with_disability', 'indirect'];

export function aggregateBeneficiaries(rows = []) {
  const result = Object.fromEntries(FIELDS.map(field => [field, null]));
  const values = Object.fromEntries(FIELDS.map(field => [field, 0]));
  const present = new Set();
  const projects = new Set();
  let checked = 0;
  let genderRows = 0;
  for (const row of rows) {
    if (row.project_id != null) projects.add(row.project_id);
    if (row.double_counting_check === true) checked += 1;
    if (row.female != null || row.male != null || row.other_gender != null) genderRows += 1;
    for (const field of FIELDS) {
      if (row[field] == null || row[field] === '') continue;
      const value = Number(row[field]);
      if (!Number.isFinite(value) || value < 0) continue;
      values[field] += value;
      present.add(field);
    }
  }
  for (const field of present) result[field] = values[field];
  return {
    total_direct: portfolioBeneficiaries(rows),
    ...result,
    records: rows.length,
    projects: projects.size,
    checked,
    genderRows,
    genderCompleteness: rows.length ? Math.round(genderRows / rows.length * 100) : null,
  };
}
