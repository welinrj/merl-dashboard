// ── DoCC DMP Mock Data ────────────────────────────────────────────────────────
// Demo data aligned with DoCC M&E Platform Architecture v1.0
// 6 project categories: CC-ADAPT, CC-MITIG, CC-RESIL, CC-POLICY, CC-CAPBLD, CC-CROSS

// ── Projects (one per category) ───────────────────────────────────────────────
export const PROJECTS = [
  {
    id: 1, code: 'CC-ADAPT-001', category: 'CC-ADAPT', category_color: '#3b82f6',
    name: 'Community Climate Adaptation Programme',
    description: 'Support 30 communities across all provinces to develop and implement community-led climate adaptation plans, focusing on coastal resilience and food security.',
    status: 'active', start_date: '2024-01-15', end_date: '2026-12-31',
    budget_vuv: 85000000, spent_vuv: 47000000,
    lead_agency: 'DoCC', provinces: ['Shefa','Sanma','Penama'],
    latitude: -17.733, longitude: 168.322,
    rbm: {
      goal: 'Vanuatu communities are resilient to the impacts of climate change',
      outcomes: [
        { id:'OUT-1A', text: 'Strengthened community adaptive capacity', outputs: [
          { id:'OUT-1A-1', text: '30 community adaptation plans developed', activities: [
            { id:'ACT-1A-1-1', text: 'Provincial consultation workshops', status:'completed', pct:100 },
            { id:'ACT-1A-1-2', text: 'Community vulnerability assessments', status:'in_progress', pct:75 },
          ]},
          { id:'OUT-1A-2', text: 'Community adaptation committees established', activities: [
            { id:'ACT-1A-2-1', text: 'Committee training and formation', status:'in_progress', pct:60 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:1, code:'IND-ADAPT-001', name:'Communities with adaptation plans', unit:'count', baseline:0, target:30, current:18, target_year:2026, freq:'Quarterly', traffic:'green' },
      { id:2, code:'IND-ADAPT-002', name:'Women in adaptation committees (%)', unit:'percent', baseline:20, target:50, current:42, target_year:2026, freq:'Annual', traffic:'green' },
      { id:3, code:'IND-ADAPT-003', name:'Adaptation measures implemented', unit:'count', baseline:0, target:90, current:38, target_year:2026, freq:'Quarterly', traffic:'amber' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:4, actual:3 },
      { q:'Q2 2025', planned:6, actual:6 },
      { q:'Q3 2025', planned:8, actual:7 },
      { q:'Q4 2025', planned:8, actual:9 },
      { q:'Q1 2026', planned:4, actual:3 },
    ],
  },
  {
    id: 2, code: 'CC-MITIG-001', category: 'CC-MITIG', category_color: '#10b981',
    name: 'Renewable Energy & Emissions Reduction',
    description: 'Install solar micro-grids and energy-efficient systems in 15 government facilities, reducing fossil fuel dependency and greenhouse gas emissions.',
    status: 'active', start_date: '2024-03-01', end_date: '2026-09-30',
    budget_vuv: 120000000, spent_vuv: 52000000,
    lead_agency: 'DoCC / DEPT ENERGY', provinces: ['Shefa','Sanma','Tafea'],
    latitude: -15.516, longitude: 167.183,
    rbm: {
      goal: 'Vanuatu reduces its greenhouse gas emissions in line with NDC commitments',
      outcomes: [
        { id:'OUT-2A', text: 'Increased use of renewable energy in government sector', outputs: [
          { id:'OUT-2A-1', text: '15 facilities with solar systems operational', activities: [
            { id:'ACT-2A-1-1', text: 'Site assessments and engineering design', status:'completed', pct:100 },
            { id:'ACT-2A-1-2', text: 'Procurement and installation', status:'in_progress', pct:53 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:4, code:'IND-MITIG-001', name:'Government facilities with solar installed', unit:'count', baseline:2, target:15, current:8, target_year:2026, freq:'Quarterly', traffic:'green' },
      { id:5, code:'IND-MITIG-002', name:'CO₂ equivalent reduced (tCO₂e/yr)', unit:'count', baseline:0, target:450, current:180, target_year:2026, freq:'Annual', traffic:'amber' },
      { id:6, code:'IND-MITIG-003', name:'Renewable energy share at sites (%)', unit:'percent', baseline:12, target:80, current:55, target_year:2026, freq:'Quarterly', traffic:'green' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:1, actual:1 },
      { q:'Q2 2025', planned:2, actual:2 },
      { q:'Q3 2025', planned:3, actual:2 },
      { q:'Q4 2025', planned:2, actual:3 },
      { q:'Q1 2026', planned:2, actual:1 },
    ],
  },
  {
    id: 3, code: 'CC-RESIL-001', category: 'CC-RESIL', category_color: '#f59e0b',
    name: 'Coastal & Disaster Resilience Infrastructure',
    description: 'Construct and rehabilitate climate-resilient infrastructure including sea walls, evacuation routes, and early warning systems in high-risk coastal areas.',
    status: 'active', start_date: '2023-07-01', end_date: '2026-06-30',
    budget_vuv: 200000000, spent_vuv: 148000000,
    lead_agency: 'MPWI / DoCC', provinces: ['Penama','Malampa','Torba'],
    latitude: -16.067, longitude: 167.250,
    rbm: {
      goal: 'Infrastructure in Vanuatu withstands climate and disaster shocks',
      outcomes: [
        { id:'OUT-3A', text: 'Climate-resilient coastal infrastructure protects communities', outputs: [
          { id:'OUT-3A-1', text: '8 sea walls and coastal protection structures built', activities: [
            { id:'ACT-3A-1-1', text: 'Engineering design and EIA', status:'completed', pct:100 },
            { id:'ACT-3A-1-2', text: 'Construction of coastal structures', status:'in_progress', pct:87 },
          ]},
          { id:'OUT-3A-2', text: 'Early warning systems installed in 20 communities', activities: [
            { id:'ACT-3A-2-1', text: 'EWS installation and community training', status:'completed', pct:100 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:7, code:'IND-RESIL-001', name:'Coastal structures constructed', unit:'count', baseline:0, target:8, current:7, target_year:2026, freq:'Quarterly', traffic:'green' },
      { id:8, code:'IND-RESIL-002', name:'People protected by EWS', unit:'count', baseline:0, target:12000, current:10800, target_year:2026, freq:'Annual', traffic:'green' },
      { id:9, code:'IND-RESIL-003', name:'Evacuation routes surveyed & marked', unit:'count', baseline:3, target:25, current:10, target_year:2026, freq:'Quarterly', traffic:'red' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:5, actual:6 },
      { q:'Q2 2025', planned:5, actual:5 },
      { q:'Q3 2025', planned:4, actual:4 },
      { q:'Q4 2025', planned:4, actual:5 },
      { q:'Q1 2026', planned:3, actual:2 },
    ],
  },
  {
    id: 4, code: 'CC-POLICY-001', category: 'CC-POLICY', category_color: '#8b5cf6',
    name: 'Climate Policy & Governance Strengthening',
    description: 'Support Vanuatu to update its NDC, strengthen climate legislation, and mainstream climate change into national and sectoral planning frameworks.',
    status: 'active', start_date: '2024-06-01', end_date: '2027-05-31',
    budget_vuv: 45000000, spent_vuv: 12000000,
    lead_agency: 'DoCC', provinces: ['Shefa'],
    latitude: -17.733, longitude: 168.322,
    rbm: {
      goal: 'Vanuatu has robust climate policy and governance frameworks',
      outcomes: [
        { id:'OUT-4A', text: 'Strengthened national climate policy environment', outputs: [
          { id:'OUT-4A-1', text: 'NDC updated and submitted to UNFCCC', activities: [
            { id:'ACT-4A-1-1', text: 'NDC technical review and stakeholder consultation', status:'in_progress', pct:45 },
            { id:'ACT-4A-1-2', text: 'NDC drafting and submission', status:'not_started', pct:0 },
          ]},
          { id:'OUT-4A-2', text: 'Climate Change Act reviewed and updated', activities: [
            { id:'ACT-4A-2-1', text: 'Legal review and gap analysis', status:'in_progress', pct:30 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:10, code:'IND-POLICY-001', name:'NDC submitted to UNFCCC', unit:'yes/no', baseline:0, target:1, current:0, target_year:2027, freq:'Annual', traffic:'amber' },
      { id:11, code:'IND-POLICY-002', name:'Climate policies adopted', unit:'count', baseline:2, target:6, current:3, target_year:2027, freq:'Annual', traffic:'green' },
      { id:12, code:'IND-POLICY-003', name:'Sectors with CC mainstreamed plans', unit:'count', baseline:1, target:8, current:3, target_year:2027, freq:'Annual', traffic:'amber' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:0, actual:0 },
      { q:'Q2 2025', planned:1, actual:1 },
      { q:'Q3 2025', planned:1, actual:1 },
      { q:'Q4 2025', planned:2, actual:1 },
      { q:'Q1 2026', planned:1, actual:1 },
    ],
  },
  {
    id: 5, code: 'CC-CAPBLD-001', category: 'CC-CAPBLD', category_color: '#ec4899',
    name: 'DoCC Institutional Capacity Building',
    description: 'Strengthen DoCC organisational capacity, including staff training in M&E, climate finance, and data management, to deliver its mandate effectively.',
    status: 'active', start_date: '2024-01-01', end_date: '2026-12-31',
    budget_vuv: 35000000, spent_vuv: 18000000,
    lead_agency: 'DoCC', provinces: ['Shefa','Sanma'],
    latitude: -17.733, longitude: 168.322,
    rbm: {
      goal: 'DoCC has the institutional capacity to effectively lead national climate action',
      outcomes: [
        { id:'OUT-5A', text: 'DoCC staff have strengthened skills in M&E and climate finance', outputs: [
          { id:'OUT-5A-1', text: '40 DoCC staff trained in M&E', activities: [
            { id:'ACT-5A-1-1', text: 'M&E training programme delivery', status:'in_progress', pct:65 },
          ]},
          { id:'OUT-5A-2', text: 'DMP system deployed and operational', activities: [
            { id:'ACT-5A-2-1', text: 'System design and development', status:'in_progress', pct:70 },
            { id:'ACT-5A-2-2', text: 'Staff onboarding and training', status:'not_started', pct:0 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:13, code:'IND-CAPBLD-001', name:'DoCC staff trained in M&E', unit:'count', baseline:0, target:40, current:26, target_year:2026, freq:'Quarterly', traffic:'green' },
      { id:14, code:'IND-CAPBLD-002', name:'DMP modules operational', unit:'count', baseline:0, target:6, current:3, target_year:2026, freq:'Quarterly', traffic:'amber' },
      { id:15, code:'IND-CAPBLD-003', name:'Climate finance proposals submitted', unit:'count', baseline:0, target:4, current:1, target_year:2026, freq:'Annual', traffic:'amber' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:4, actual:4 },
      { q:'Q2 2025', planned:6, actual:7 },
      { q:'Q3 2025', planned:6, actual:5 },
      { q:'Q4 2025', planned:5, actual:6 },
      { q:'Q1 2026', planned:4, actual:4 },
    ],
  },
  {
    id: 6, code: 'CC-CROSS-001', category: 'CC-CROSS', category_color: '#6366f1',
    name: 'GEDSI & Cross-Cutting Climate Integration',
    description: 'Mainstream gender equality, disability, social inclusion and climate change across all DoCC programmes and ensure vulnerable groups are not left behind.',
    status: 'active', start_date: '2024-02-01', end_date: '2027-01-31',
    budget_vuv: 28000000, spent_vuv: 8500000,
    lead_agency: 'DoCC / MWCW', provinces: ['Shefa','Tafea','Penama'],
    latitude: -19.533, longitude: 169.267,
    rbm: {
      goal: 'Climate action in Vanuatu is inclusive, equitable, and reaches the most vulnerable',
      outcomes: [
        { id:'OUT-6A', text: 'GEDSI principles integrated in DoCC programmes', outputs: [
          { id:'OUT-6A-1', text: 'GEDSI action plan developed and adopted', activities: [
            { id:'ACT-6A-1-1', text: 'GEDSI baseline assessment', status:'completed', pct:100 },
            { id:'ACT-6A-1-2', text: 'GEDSI action plan development', status:'in_progress', pct:40 },
          ]},
          { id:'OUT-6A-2', text: 'Sex-disaggregated data collected in all projects', activities: [
            { id:'ACT-6A-2-1', text: 'GEDSI data framework design', status:'in_progress', pct:55 },
          ]},
        ]},
      ],
    },
    indicators: [
      { id:16, code:'IND-CROSS-001', name:'Projects with GEDSI plans', unit:'count', baseline:0, target:6, current:4, target_year:2027, freq:'Annual', traffic:'green' },
      { id:17, code:'IND-CROSS-002', name:'Female beneficiaries reached (%)', unit:'percent', baseline:35, target:50, current:47, target_year:2027, freq:'Quarterly', traffic:'green' },
      { id:18, code:'IND-CROSS-003', name:'Disability-inclusive activities (%)', unit:'percent', baseline:0, target:80, current:30, target_year:2027, freq:'Annual', traffic:'red' },
    ],
    quarterly: [
      { q:'Q1 2025', planned:2, actual:1 },
      { q:'Q2 2025', planned:3, actual:3 },
      { q:'Q3 2025', planned:3, actual:2 },
      { q:'Q4 2025', planned:3, actual:3 },
      { q:'Q1 2026', planned:2, actual:2 },
    ],
  },
];

// ── Flat indicators list ──────────────────────────────────────────────────────
export const ALL_INDICATORS = PROJECTS.flatMap(p =>
  p.indicators.map(i => ({ ...i, project_code: p.code, project_name: p.name, category: p.category, category_color: p.category_color }))
);

// ── Datasets ──────────────────────────────────────────────────────────────────
export const DATASETS = [
  { id:1, name:'Shefa Community Adaptation Survey Q1 2026', project_code:'CC-ADAPT-001', type:'csv', rows:245, size_kb:48, uploaded_by:'Carol MEO', uploaded_at:'2026-01-20T09:30:00Z', status:'processed', tags:['adaptation','shefa','survey'] },
  { id:2, name:'Solar Installation Status Report Q4 2025', project_code:'CC-MITIG-001', type:'xlsx', rows:15, size_kb:32, uploaded_by:'David Manager', uploaded_at:'2026-01-05T14:00:00Z', status:'processed', tags:['mitigation','solar','infrastructure'] },
  { id:3, name:'Coastal Structure GIS Survey 2025', project_code:'CC-RESIL-001', type:'geojson', rows:8, size_kb:512, uploaded_by:'Carol MEO', uploaded_at:'2025-12-18T11:00:00Z', status:'processed', tags:['resilience','gis','coastal'] },
  { id:4, name:'NDC Stakeholder Consultation Responses', project_code:'CC-POLICY-001', type:'csv', rows:87, size_kb:24, uploaded_by:'Alice Admin', uploaded_at:'2025-11-30T16:00:00Z', status:'processed', tags:['policy','ndc','consultation'] },
  { id:5, name:'DoCC Staff Training Register 2025', project_code:'CC-CAPBLD-001', type:'xlsx', rows:40, size_kb:18, uploaded_by:'Bob Senior', uploaded_at:'2025-12-28T10:00:00Z', status:'processed', tags:['capacity','training','staff'] },
  { id:6, name:'GEDSI Baseline Assessment Data', project_code:'CC-CROSS-001', type:'csv', rows:312, size_kb:67, uploaded_by:'Carol MEO', uploaded_at:'2026-02-10T08:30:00Z', status:'processed', tags:['gedsi','baseline','cross-cutting'] },
  { id:7, name:'Penama Adaptation Activities Q1 2026', project_code:'CC-ADAPT-001', type:'csv', rows:189, size_kb:41, uploaded_by:'David Manager', uploaded_at:'2026-03-15T09:00:00Z', status:'partial', tags:['adaptation','penama'] },
  { id:8, name:'Tafea Coastal Erosion Monitoring', project_code:'CC-RESIL-001', type:'geojson', rows:22, size_kb:280, uploaded_by:'Carol MEO', uploaded_at:'2026-03-01T12:00:00Z', status:'processed', tags:['resilience','gis','tafea'] },
];

// ── Users ─────────────────────────────────────────────────────────────────────
export const SYSTEM_USERS = [
  { id:1, name:'Alice Admin',   email:'admin@docc.gov.vu',   role:'ROLE_ADMIN',        project:null,             active:true,  last_login:'2026-04-14T08:00:00Z' },
  { id:2, name:'Bob Senior',    email:'senior@docc.gov.vu',  role:'ROLE_DOCC_SENIOR',  project:null,             active:true,  last_login:'2026-04-14T07:30:00Z' },
  { id:3, name:'Carol MEO',     email:'meo@docc.gov.vu',     role:'ROLE_DOCC_MEO',     project:null,             active:true,  last_login:'2026-04-13T16:00:00Z' },
  { id:4, name:'David Manager', email:'manager@project.vu',  role:'ROLE_PROJ_MANAGER', project:'CC-ADAPT-001',   active:true,  last_login:'2026-04-12T11:00:00Z' },
  { id:5, name:'Eve Staff',     email:'staff@project.vu',    role:'ROLE_PROJ_STAFF',   project:'CC-RESIL-001',   active:true,  last_login:'2026-04-10T09:00:00Z' },
];

// ── Audit log ─────────────────────────────────────────────────────────────────
export const AUDIT_LOG = [
  { id:1, user:'Alice Admin',   action:'User created',          resource:'Eve Staff',           timestamp:'2026-04-10T09:00:00Z' },
  { id:2, user:'Carol MEO',     action:'Dataset uploaded',       resource:'GEDSI Baseline Assessment Data', timestamp:'2026-02-10T08:30:00Z' },
  { id:3, user:'David Manager', action:'Indicator updated',      resource:'IND-ADAPT-001',       timestamp:'2026-03-20T14:00:00Z' },
  { id:4, user:'Bob Senior',    action:'Report generated',       resource:'Q1 2026 Quarterly',   timestamp:'2026-04-05T10:30:00Z' },
  { id:5, user:'Carol MEO',     action:'Dataset uploaded',       resource:'Penama Adaptation Q1', timestamp:'2026-03-15T09:00:00Z' },
  { id:6, user:'Alice Admin',   action:'System config updated',  resource:'Email notifications', timestamp:'2026-03-01T11:00:00Z' },
];

// ── Dashboard summary ─────────────────────────────────────────────────────────
export const DASHBOARD_SUMMARY = {
  total_projects: PROJECTS.length,
  active_projects: PROJECTS.filter(p => p.status === 'active').length,
  total_indicators: ALL_INDICATORS.length,
  indicators_green: ALL_INDICATORS.filter(i => i.traffic === 'green').length,
  indicators_amber: ALL_INDICATORS.filter(i => i.traffic === 'amber').length,
  indicators_red:   ALL_INDICATORS.filter(i => i.traffic === 'red').length,
  total_budget_vuv: PROJECTS.reduce((s,p) => s + p.budget_vuv, 0),
  total_spent_vuv:  PROJECTS.reduce((s,p) => s + p.spent_vuv, 0),
  total_datasets:   DATASETS.length,
};
