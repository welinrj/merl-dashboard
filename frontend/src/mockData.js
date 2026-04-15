// ── Vanuatu Loss & Damage Fund MERL Dashboard — Demo Data ────────────────────
// Project: Vanuatu Loss and Damage Fund Development Project
// Funder: MFAT, Government of New Zealand (NZD 4 million)
// Reporting to: Project Manager, DoCC, MoCC, Government of Vanuatu
// Framework: Paris Agreement · UNFCCC FRLD · Vanuatu NAP
// 2 Active Projects: VCCRP & VCAP2

// ── Projects ──────────────────────────────────────────────────────────────────
export const PROJECTS = [
  {
    id: 1, code: 'VCCRP-001', category: 'CC-RESIL', category_color: '#3b82f6',
    name: 'Vanuatu Community Climate Resilience Project',
    description: 'Strengthen climate resilience of vulnerable communities across Vanuatu through integrated adaptation planning, community-based early warning systems, and resilient livelihoods support across four provinces.',
    status: 'active', start_date: '2024-01-15', end_date: '2026-12-31',
    budget_vuv: 95000000, spent_vuv: 42000000,
    lead_agency: 'DoCC', provinces: ['Shefa', 'Sanma', 'Penama', 'Tafea'],
    latitude: -17.733, longitude: 168.322,
    rbm: {
      goal: 'Vanuatu communities are resilient to the impacts of climate change and loss and damage',
      outcomes: [
        {
          id: 'OUT-VCCRP-1', text: 'Strengthened community adaptive capacity in target provinces',
          outputs: [
            {
              id: 'OUT-VCCRP-1-1', text: '25 community resilience plans developed and implemented',
              activities: [
                { id: 'ACT-VCCRP-1-1-1', text: 'Provincial consultation and vulnerability assessments', status: 'completed', pct: 100 },
                { id: 'ACT-VCCRP-1-1-2', text: 'Community resilience plan development', status: 'in_progress', pct: 72 },
              ],
            },
            {
              id: 'OUT-VCCRP-1-2', text: 'Early warning systems installed in 20 communities',
              activities: [
                { id: 'ACT-VCCRP-1-2-1', text: 'EWS procurement and installation', status: 'in_progress', pct: 55 },
                { id: 'ACT-VCCRP-1-2-2', text: 'Community training on EWS operation', status: 'not_started', pct: 0 },
              ],
            },
          ],
        },
      ],
    },
    indicators: [
      { id: 1, code: 'VCCRP-IND-001', name: 'Communities with resilience plans', unit: 'count', baseline: 0, target: 25, current: 18, target_year: 2026, freq: 'Quarterly', traffic: 'green' },
      { id: 2, code: 'VCCRP-IND-002', name: 'Early warning systems installed', unit: 'count', baseline: 0, target: 20, current: 11, target_year: 2026, freq: 'Quarterly', traffic: 'amber' },
      { id: 3, code: 'VCCRP-IND-003', name: 'Female beneficiaries reached (%)', unit: 'percent', baseline: 30, target: 50, current: 44, target_year: 2026, freq: 'Quarterly', traffic: 'green' },
    ],
    quarterly: [
      { q: 'Q1 2025', planned: 5, actual: 4 },
      { q: 'Q2 2025', planned: 6, actual: 7 },
      { q: 'Q3 2025', planned: 7, actual: 6 },
      { q: 'Q4 2025', planned: 7, actual: 8 },
      { q: 'Q1 2026', planned: 5, actual: 4 },
    ],
  },
  {
    id: 2, code: 'VCAP2-001', category: 'CC-ADAPT', category_color: '#10b981',
    name: 'Vanuatu Climate Adaptation Project Phase 2',
    description: 'Scale up proven climate adaptation interventions from VCAP Phase 1, expanding integrated coastal zone management, climate-smart agriculture, and national policy alignment across all six provinces.',
    status: 'active', start_date: '2024-06-01', end_date: '2027-05-31',
    budget_vuv: 120000000, spent_vuv: 38000000,
    lead_agency: 'DoCC / MALFFB', provinces: ['Shefa', 'Sanma', 'Penama', 'Malampa', 'Torba', 'Tafea'],
    latitude: -15.516, longitude: 167.183,
    rbm: {
      goal: "Vanuatu's development is climate-resilient and aligned with the Paris Agreement",
      outcomes: [
        {
          id: 'OUT-VCAP2-1', text: 'Improved climate-smart agricultural practices adopted by smallholder farmers',
          outputs: [
            {
              id: 'OUT-VCAP2-1-1', text: 'Climate-smart agriculture packages scaled to 1,500 households',
              activities: [
                { id: 'ACT-VCAP2-1-1-1', text: 'Farmer training and demonstration plots', status: 'in_progress', pct: 60 },
                { id: 'ACT-VCAP2-1-1-2', text: 'Input supply and agricultural extension services', status: 'in_progress', pct: 45 },
              ],
            },
            {
              id: 'OUT-VCAP2-1-2', text: 'Coastal zone management plans adopted in 4 provinces',
              activities: [
                { id: 'ACT-VCAP2-1-2-1', text: 'Coastal baseline assessments', status: 'completed', pct: 100 },
                { id: 'ACT-VCAP2-1-2-2', text: 'Integrated coastal zone plan drafting', status: 'in_progress', pct: 35 },
              ],
            },
          ],
        },
      ],
    },
    indicators: [
      { id: 4, code: 'VCAP2-IND-001', name: 'Households adopting climate-smart agriculture', unit: 'count', baseline: 200, target: 1500, current: 720, target_year: 2027, freq: 'Quarterly', traffic: 'green' },
      { id: 5, code: 'VCAP2-IND-002', name: 'Coastal management plans adopted', unit: 'count', baseline: 0, target: 4, current: 1, target_year: 2027, freq: 'Annual', traffic: 'amber' },
      { id: 6, code: 'VCAP2-IND-003', name: 'Policy frameworks updated with CC provisions', unit: 'count', baseline: 1, target: 6, current: 2, target_year: 2027, freq: 'Annual', traffic: 'amber' },
    ],
    quarterly: [
      { q: 'Q1 2025', planned: 3, actual: 2 },
      { q: 'Q2 2025', planned: 4, actual: 4 },
      { q: 'Q3 2025', planned: 5, actual: 4 },
      { q: 'Q4 2025', planned: 5, actual: 6 },
      { q: 'Q1 2026', planned: 4, actual: 3 },
    ],
  },
];

// ── Flat indicators list ──────────────────────────────────────────────────────
export const ALL_INDICATORS = PROJECTS.flatMap(p =>
  p.indicators.map(i => ({
    ...i,
    project_code: p.code,
    project_name: p.name,
    category: p.category,
    category_color: p.category_color,
  }))
);

// ── Datasets ──────────────────────────────────────────────────────────────────
export const DATASETS = [
  { id: 1, name: 'Shefa Community Vulnerability Assessment Q1 2026', project_code: 'VCCRP-001', type: 'csv', rows: 245, size_kb: 48, uploaded_by: 'Carol MEO', uploaded_at: '2026-01-20T09:30:00Z', status: 'processed', tags: ['resilience', 'shefa', 'survey'] },
  { id: 2, name: 'EWS Installation Status Report Q4 2025', project_code: 'VCCRP-001', type: 'xlsx', rows: 20, size_kb: 32, uploaded_by: 'David Manager', uploaded_at: '2026-01-05T14:00:00Z', status: 'processed', tags: ['ews', 'resilience', 'infrastructure'] },
  { id: 3, name: 'Coastal Baseline GIS Survey 2025 — VCAP2', project_code: 'VCAP2-001', type: 'geojson', rows: 6, size_kb: 512, uploaded_by: 'Carol MEO', uploaded_at: '2025-12-18T11:00:00Z', status: 'processed', tags: ['adaptation', 'gis', 'coastal'] },
  { id: 4, name: 'Climate-Smart Agriculture Household Register Q1 2026', project_code: 'VCAP2-001', type: 'xlsx', rows: 720, size_kb: 88, uploaded_by: 'David Manager', uploaded_at: '2026-03-20T10:00:00Z', status: 'processed', tags: ['adaptation', 'agriculture', 'household'] },
  { id: 5, name: 'Penama Community Resilience Plans Q3 2025', project_code: 'VCCRP-001', type: 'csv', rows: 189, size_kb: 41, uploaded_by: 'Eve Staff', uploaded_at: '2025-10-15T09:00:00Z', status: 'partial', tags: ['resilience', 'penama'] },
  { id: 6, name: 'Tafea Coastal Erosion Monitoring Data', project_code: 'VCAP2-001', type: 'geojson', rows: 22, size_kb: 280, uploaded_by: 'Carol MEO', uploaded_at: '2026-03-01T12:00:00Z', status: 'processed', tags: ['adaptation', 'gis', 'tafea'] },
];

// ── Users ─────────────────────────────────────────────────────────────────────
export const SYSTEM_USERS = [
  { id: 1, name: 'Alice Admin',   email: 'admin@docc.gov.vu',   role: 'ROLE_ADMIN',        project: null,         active: true, last_login: '2026-04-14T08:00:00Z' },
  { id: 2, name: 'Bob Senior',    email: 'senior@docc.gov.vu',  role: 'ROLE_DOCC_SENIOR',  project: null,         active: true, last_login: '2026-04-14T07:30:00Z' },
  { id: 3, name: 'Carol MEO',     email: 'meo@docc.gov.vu',     role: 'ROLE_DOCC_MEO',     project: null,         active: true, last_login: '2026-04-13T16:00:00Z' },
  { id: 4, name: 'David Manager', email: 'manager@project.vu',  role: 'ROLE_PROJ_MANAGER', project: 'VCCRP-001',  active: true, last_login: '2026-04-12T11:00:00Z' },
  { id: 5, name: 'Eve Staff',     email: 'staff@project.vu',    role: 'ROLE_PROJ_STAFF',   project: 'VCAP2-001',  active: true, last_login: '2026-04-10T09:00:00Z' },
];

// ── Audit log ─────────────────────────────────────────────────────────────────
export const AUDIT_LOG = [
  { id: 1, user: 'Alice Admin',   action: 'User created',         resource: 'Eve Staff',                           timestamp: '2026-04-10T09:00:00Z' },
  { id: 2, user: 'Carol MEO',     action: 'Dataset uploaded',     resource: 'Tafea Coastal Erosion Monitoring',    timestamp: '2026-03-01T12:00:00Z' },
  { id: 3, user: 'David Manager', action: 'Indicator updated',    resource: 'VCCRP-IND-001',                       timestamp: '2026-03-20T14:00:00Z' },
  { id: 4, user: 'Bob Senior',    action: 'Report generated',     resource: 'Q1 2026 Quarterly Progress Report',   timestamp: '2026-04-05T10:30:00Z' },
  { id: 5, user: 'Carol MEO',     action: 'Dataset uploaded',     resource: 'Climate-Smart Agriculture Register',  timestamp: '2026-03-20T10:00:00Z' },
  { id: 6, user: 'Alice Admin',   action: 'System config updated',resource: 'Email notifications',                 timestamp: '2026-03-01T11:00:00Z' },
];

// ── Dashboard summary (computed dynamically in App using live projects state) ─
export const DASHBOARD_SUMMARY = {
  total_projects: PROJECTS.length,
  active_projects: PROJECTS.filter(p => p.status === 'active').length,
  total_indicators: ALL_INDICATORS.length,
  indicators_green: ALL_INDICATORS.filter(i => i.traffic === 'green').length,
  indicators_amber: ALL_INDICATORS.filter(i => i.traffic === 'amber').length,
  indicators_red:   ALL_INDICATORS.filter(i => i.traffic === 'red').length,
  total_budget_vuv: PROJECTS.reduce((s, p) => s + p.budget_vuv, 0),
  total_spent_vuv:  PROJECTS.reduce((s, p) => s + p.spent_vuv, 0),
  total_datasets:   DATASETS.length,
};
