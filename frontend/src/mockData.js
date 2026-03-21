// ── Mock Data for GitHub Pages Demo Mode ─────────────────────────────────────
// When no backend is available (e.g. GitHub Pages), axios interceptor returns
// this data so every page renders with realistic sample content.

export const DEMO_INDICATORS = [
  { id: 1, code: 'IND-001', name: 'Communities with climate adaptation plans', domain: 'Community', unit: 'count', baseline_value: 0, target_value: 20, target_year: 2027, status: 'on_track', reporting_frequency: 'quarterly', responsible_party: 'DoCC', achieved: 12, values: [
    { id: 1, value: 3, recorded_date: '2025-06-30', period_label: 'Q2 2025' },
    { id: 2, value: 7, recorded_date: '2025-09-30', period_label: 'Q3 2025' },
    { id: 3, value: 12, recorded_date: '2025-12-31', period_label: 'Q4 2025' },
  ]},
  { id: 2, code: 'IND-002', name: 'Loss & Damage events documented', domain: 'Environment', unit: 'count', baseline_value: 0, target_value: 50, target_year: 2027, status: 'on_track', reporting_frequency: 'monthly', responsible_party: 'NDMO', achieved: 34, values: [
    { id: 4, value: 10, recorded_date: '2025-06-30', period_label: 'Q2 2025' },
    { id: 5, value: 22, recorded_date: '2025-09-30', period_label: 'Q3 2025' },
    { id: 6, value: 34, recorded_date: '2025-12-31', period_label: 'Q4 2025' },
  ]},
  { id: 3, code: 'IND-003', name: 'Government staff trained in MERL', domain: 'Governance', unit: 'count', baseline_value: 0, target_value: 40, target_year: 2027, status: 'at_risk', reporting_frequency: 'quarterly', responsible_party: 'DoCC', achieved: 15, values: [
    { id: 7, value: 5, recorded_date: '2025-06-30', period_label: 'Q2 2025' },
    { id: 8, value: 10, recorded_date: '2025-09-30', period_label: 'Q3 2025' },
    { id: 9, value: 15, recorded_date: '2025-12-31', period_label: 'Q4 2025' },
  ]},
  { id: 4, code: 'IND-004', name: 'GEDSI-responsive policies adopted', domain: 'GEDSI', unit: 'count', baseline_value: 0, target_value: 5, target_year: 2027, status: 'on_track', reporting_frequency: 'annual', responsible_party: 'MoCC', achieved: 3, values: [
    { id: 10, value: 1, recorded_date: '2025-06-30', period_label: '2025 H1' },
    { id: 11, value: 3, recorded_date: '2025-12-31', period_label: '2025 H2' },
  ]},
  { id: 5, code: 'IND-005', name: 'Disbursement utilisation rate', domain: 'Finance', unit: 'percentage', baseline_value: 0, target_value: 90, target_year: 2027, status: 'on_track', reporting_frequency: 'quarterly', responsible_party: 'MoCC', achieved: 72, values: [
    { id: 12, value: 45, recorded_date: '2025-06-30', period_label: 'Q2 2025' },
    { id: 13, value: 60, recorded_date: '2025-09-30', period_label: 'Q3 2025' },
    { id: 14, value: 72, recorded_date: '2025-12-31', period_label: 'Q4 2025' },
  ]},
  { id: 6, code: 'IND-006', name: 'Knowledge products published', domain: 'Knowledge', unit: 'count', baseline_value: 0, target_value: 12, target_year: 2027, status: 'completed', reporting_frequency: 'quarterly', responsible_party: 'DoCC', achieved: 12, values: [
    { id: 15, value: 4, recorded_date: '2025-06-30', period_label: 'Q2 2025' },
    { id: 16, value: 8, recorded_date: '2025-09-30', period_label: 'Q3 2025' },
    { id: 17, value: 12, recorded_date: '2025-12-31', period_label: 'Q4 2025' },
  ]},
];

export const DEMO_ACTIVITIES = [
  { id: 1, code: 'ACT-001', name: 'Provincial MERL training workshops', type: 'Training', phase: 'Phase 1', status: 'completed', start_date: '2025-03-01', end_date: '2025-06-30', completion_pct: 100, domain: 'Governance', description: 'Deliver MERL training across all 6 provinces', milestones: [
    { id: 1, title: 'Training materials finalised', due_date: '2025-03-15', completed_date: '2025-03-12', is_completed: true },
    { id: 2, title: 'Workshops delivered in Shefa & Sanma', due_date: '2025-04-30', completed_date: '2025-04-28', is_completed: true },
    { id: 3, title: 'All provinces trained', due_date: '2025-06-30', completed_date: '2025-06-25', is_completed: true },
  ]},
  { id: 2, code: 'ACT-002', name: 'Community climate adaptation planning', type: 'Consultation', phase: 'Phase 1', status: 'in_progress', start_date: '2025-04-01', end_date: '2026-03-31', completion_pct: 60, domain: 'Community', description: 'Support 20 communities to develop climate adaptation plans', milestones: [
    { id: 4, title: 'Community selection completed', due_date: '2025-05-15', completed_date: '2025-05-10', is_completed: true },
    { id: 5, title: '10 plans completed', due_date: '2025-10-31', completed_date: '2025-11-05', is_completed: true },
    { id: 6, title: 'All 20 plans completed', due_date: '2026-03-31', completed_date: null, is_completed: false },
  ]},
  { id: 3, code: 'ACT-003', name: 'L&D data collection system deployment', type: 'Field Visit', phase: 'Phase 1', status: 'completed', start_date: '2025-01-15', end_date: '2025-09-30', completion_pct: 100, domain: 'Environment', description: 'Deploy digital L&D data collection tools to all provinces', milestones: [
    { id: 7, title: 'System design approved', due_date: '2025-02-28', completed_date: '2025-02-25', is_completed: true },
    { id: 8, title: 'Pilot in Shefa', due_date: '2025-05-31', completed_date: '2025-05-20', is_completed: true },
    { id: 9, title: 'Nationwide rollout', due_date: '2025-09-30', completed_date: '2025-09-28', is_completed: true },
  ]},
  { id: 4, code: 'ACT-004', name: 'Financial management capacity building', type: 'Training', phase: 'Phase 2', status: 'in_progress', start_date: '2025-07-01', end_date: '2026-06-30', completion_pct: 35, domain: 'Finance', description: 'Strengthen financial management capacity at provincial level', milestones: [
    { id: 10, title: 'Needs assessment completed', due_date: '2025-08-31', completed_date: '2025-08-20', is_completed: true },
    { id: 11, title: 'Training delivery commenced', due_date: '2025-11-30', completed_date: null, is_completed: false },
  ]},
  { id: 5, code: 'ACT-005', name: 'GEDSI assessment and mainstreaming', type: 'Consultation', phase: 'Phase 2', status: 'delayed', start_date: '2025-09-01', end_date: '2026-06-30', completion_pct: 20, domain: 'GEDSI', description: 'Conduct GEDSI assessment and mainstream into project activities', milestones: [
    { id: 12, title: 'GEDSI baseline assessment', due_date: '2025-11-30', completed_date: null, is_completed: false },
  ]},
  { id: 6, code: 'ACT-006', name: 'National climate finance strategy review', type: 'Consultation', phase: 'Phase 2', status: 'not_started', start_date: '2026-04-01', end_date: '2026-12-31', completion_pct: 0, domain: 'Governance', description: 'Support the review of the national climate finance strategy', milestones: [] },
];

export const DEMO_EVENTS = [
  { id: 1, name: 'TC Lola', event_type: 'cyclone', onset_type: 'rapid', start_date: '2025-12-10', end_date: '2025-12-14', islands_affected: 'Efate, Epi', provinces_affected: 'Shefa, Penama', economic_loss_vuv: 125000000, affected_people: 3200, affected_households: 640, fatalities: 0, injuries: 12, latitude: -17.7333, longitude: 168.3167, description: 'Category 3 tropical cyclone causing significant infrastructure damage in central Vanuatu.', response_actions: 'Emergency shelters activated, NDMO coordination, damage assessment teams deployed.', verified: true },
  { id: 2, name: 'Ambae Flooding Jan 2026', event_type: 'flood', onset_type: 'rapid', start_date: '2026-01-20', end_date: '2026-01-25', islands_affected: 'Ambae', provinces_affected: 'Penama', economic_loss_vuv: 18500000, affected_people: 890, affected_households: 178, fatalities: 0, injuries: 3, latitude: -15.3833, longitude: 167.8333, description: 'Heavy rainfall caused flooding in low-lying areas of South Ambae.', response_actions: 'Temporary relocation of affected families, food distribution.', verified: true },
  { id: 3, name: 'Tanna Drought 2025', event_type: 'drought', onset_type: 'slow', start_date: '2025-08-01', end_date: '2025-11-30', islands_affected: 'Tanna', provinces_affected: 'Tafea', economic_loss_vuv: 42000000, affected_people: 5600, affected_households: 1120, fatalities: 0, injuries: 0, latitude: -19.5333, longitude: 169.2667, description: 'Extended dry period affecting food crops and water supplies in southern Tanna.', response_actions: 'Water trucking, drought-resistant seed distribution, food security monitoring.', verified: true },
  { id: 4, name: 'Malekula Coastal Erosion', event_type: 'sea_level', onset_type: 'slow', start_date: '2025-06-01', end_date: '2026-03-01', islands_affected: 'Malekula', provinces_affected: 'Malampa', economic_loss_vuv: 35000000, affected_people: 320, affected_households: 64, fatalities: 0, injuries: 0, latitude: -16.0667, longitude: 167.2000, description: 'Progressive coastal erosion threatening 3 villages on south Malekula coast.', response_actions: 'Community relocation planning, mangrove restoration programme initiated.', verified: true },
  { id: 5, name: 'Santo Earthquake Feb 2026', event_type: 'earthquake', onset_type: 'rapid', start_date: '2026-02-15', end_date: '2026-02-15', islands_affected: 'Espiritu Santo', provinces_affected: 'Sanma', economic_loss_vuv: 8200000, affected_people: 150, affected_households: 30, fatalities: 0, injuries: 5, latitude: -15.4167, longitude: 166.9167, description: 'M5.2 earthquake centred near Luganville, minor structural damage.', response_actions: 'Structural assessments conducted, community awareness sessions held.', verified: true },
  { id: 6, name: 'Pentecost Landslide', event_type: 'landslide', onset_type: 'rapid', start_date: '2026-03-05', end_date: '2026-03-06', islands_affected: 'Pentecost', provinces_affected: 'Penama', economic_loss_vuv: 5500000, affected_people: 75, affected_households: 15, fatalities: 0, injuries: 2, latitude: -15.7833, longitude: 168.1833, description: 'Landslide triggered by heavy rain blocked a main road and damaged 2 houses.', response_actions: 'Road clearance, temporary shelter provided, geotechnical survey planned.', verified: false },
];

export const DEMO_ENGAGEMENTS = [
  { id: 1, community_name: 'Mele Village', island: 'Efate', province: 'Shefa', engagement_date: '2026-02-15', engagement_type: 'Community Consultation', total_participants: 45, male_participants: 22, female_participants: 23, youth_participants: 12, disability_participants: 3, outcomes: 'Community agreed to establish a climate adaptation committee. Key concerns raised about coastal erosion and water security.', follow_up_required: true, latitude: -17.7000, longitude: 168.2500 },
  { id: 2, community_name: 'Lakatoro', island: 'Malekula', province: 'Malampa', engagement_date: '2026-02-10', engagement_type: 'Awareness Workshop', total_participants: 62, male_participants: 28, female_participants: 34, youth_participants: 18, disability_participants: 2, outcomes: 'Workshop on disaster preparedness completed. Participants developed household emergency plans.', follow_up_required: false, latitude: -16.1000, longitude: 167.4167 },
  { id: 3, community_name: 'Lenakel', island: 'Tanna', province: 'Tafea', engagement_date: '2026-01-25', engagement_type: 'Focus Group Discussion', total_participants: 18, male_participants: 7, female_participants: 11, youth_participants: 6, disability_participants: 1, outcomes: 'Focus group on drought impacts. Women reported disproportionate burden of water collection during dry periods.', follow_up_required: true, latitude: -19.5333, longitude: 169.2667 },
  { id: 4, community_name: 'Luganville Market Area', island: 'Espiritu Santo', province: 'Sanma', engagement_date: '2026-01-18', engagement_type: 'Survey / Data Collection', total_participants: 85, male_participants: 40, female_participants: 45, youth_participants: 25, disability_participants: 4, outcomes: 'Household survey on climate vulnerability completed for urban Luganville area. Data being analysed.', follow_up_required: false, latitude: -15.5167, longitude: 167.1667 },
  { id: 5, community_name: 'Saratamata', island: 'Ambae', province: 'Penama', engagement_date: '2026-03-02', engagement_type: 'Training', total_participants: 30, male_participants: 14, female_participants: 16, youth_participants: 10, disability_participants: 0, outcomes: 'Training on MERL data collection tools for community volunteers. All participants now able to use mobile data forms.', follow_up_required: true, latitude: -15.2500, longitude: 167.9667 },
  { id: 6, community_name: 'Sola', island: 'Vanua Lava', province: 'Torba', engagement_date: '2025-12-08', engagement_type: 'Steering Committee', total_participants: 15, male_participants: 9, female_participants: 6, youth_participants: 2, disability_participants: 0, outcomes: 'Provincial steering committee meeting. Reviewed Q4 progress and approved Q1 2026 workplan.', follow_up_required: false, latitude: -13.8667, longitude: 167.5500 },
  { id: 7, community_name: 'Port Vila Community Hall', island: 'Efate', province: 'Shefa', engagement_date: '2026-03-10', engagement_type: 'Community Consultation', total_participants: 55, male_participants: 25, female_participants: 30, youth_participants: 15, disability_participants: 5, outcomes: 'National-level community consultation on L&D fund access mechanisms. Strong demand for simplified application processes.', follow_up_required: true, latitude: -17.7333, longitude: 168.3167 },
];

export const DEMO_FINANCIAL_SUMMARY = {
  total_committed_vuv: 450000000,
  total_disbursed_vuv: 320000000,
  total_expended_vuv: 230000000,
  remaining_vuv: 90000000,
  uncommitted_vuv: 130000000,
  total_committed_nzd: 2812500,
  total_disbursed_nzd: 2000000,
  total_expended_nzd: 1437500,
  remaining_nzd: 562500,
  absorption_rate: 71.9,
  burn_rate_pct: 72,
};

export const DEMO_TRANSACTIONS = [
  { id: 1, transaction_date: '2025-03-15', period_label: 'Q1-2025', transaction_type: 'disbursement', amount_vuv: 80000000, amount_nzd: 500000, description: 'Initial project disbursement from MFAT', activity_code: 'ACT-001', domain: 'Governance', donor: 'MFAT NZ', reference: 'MFAT-2025-001' },
  { id: 2, transaction_date: '2025-06-20', period_label: 'Q2-2025', transaction_type: 'expenditure', amount_vuv: 25000000, amount_nzd: 156250, description: 'Provincial MERL training delivery costs', activity_code: 'ACT-001', domain: 'Governance', donor: 'MFAT NZ', reference: 'EXP-2025-014' },
  { id: 3, transaction_date: '2025-07-01', period_label: 'Q3-2025', transaction_type: 'disbursement', amount_vuv: 120000000, amount_nzd: 750000, description: 'Second tranche disbursement', activity_code: null, domain: 'General', donor: 'MFAT NZ', reference: 'MFAT-2025-002' },
  { id: 4, transaction_date: '2025-09-10', period_label: 'Q3-2025', transaction_type: 'expenditure', amount_vuv: 45000000, amount_nzd: 281250, description: 'Community adaptation planning fieldwork', activity_code: 'ACT-002', domain: 'Community', donor: 'MFAT NZ', reference: 'EXP-2025-028' },
  { id: 5, transaction_date: '2025-11-05', period_label: 'Q4-2025', transaction_type: 'expenditure', amount_vuv: 32000000, amount_nzd: 200000, description: 'L&D data system development and deployment', activity_code: 'ACT-003', domain: 'Environment', donor: 'MFAT NZ', reference: 'EXP-2025-035' },
  { id: 6, transaction_date: '2026-01-10', period_label: 'Q1-2026', transaction_type: 'disbursement', amount_vuv: 120000000, amount_nzd: 750000, description: 'Third tranche disbursement', activity_code: null, domain: 'General', donor: 'MFAT NZ', reference: 'MFAT-2026-001' },
  { id: 7, transaction_date: '2026-02-01', period_label: 'Q1-2026', transaction_type: 'expenditure', amount_vuv: 58000000, amount_nzd: 362500, description: 'Financial management training and GEDSI assessment', activity_code: 'ACT-004', domain: 'Finance', donor: 'MFAT NZ', reference: 'EXP-2026-005' },
  { id: 8, transaction_date: '2026-03-01', period_label: 'Q1-2026', transaction_type: 'expenditure', amount_vuv: 70000000, amount_nzd: 437500, description: 'Q1 operational and programme delivery costs', activity_code: null, domain: 'General', donor: 'MFAT NZ', reference: 'EXP-2026-012' },
  { id: 9, transaction_date: '2025-08-15', period_label: 'Q3-2025', transaction_type: 'refund', amount_vuv: 3500000, amount_nzd: 21875, description: 'Refund from cancelled training venue booking', activity_code: 'ACT-001', domain: 'Governance', donor: 'MFAT NZ', reference: 'REF-2025-002' },
];

export const DEMO_LEARNING = [
  { id: 1, title: 'Community-led DRR planning improves local response capacity', entry_type: 'lesson_learned', domain: 'Community Engagement', activity_code: 'ACT-002', description: 'Allowing communities to lead the development of their own disaster risk reduction plans resulted in significantly higher engagement and ownership compared to top-down approaches. Communities in Shefa who led their own planning process showed 80% plan implementation within 6 months.', context: 'During the community climate adaptation planning activity, two approaches were trialled: facilitator-led and community-led planning processes.', recommendations: 'Adopt community-led approaches as the default methodology for all future DRR and adaptation planning activities.', tags: ['DRR', 'community-led', 'ownership', 'adaptation'], author: 'Sarah Johnson', published: true, created_at: '2026-01-15T10:00:00Z', reviewed_by: 'Dr. Maria Chen' },
  { id: 2, title: 'Mobile data collection significantly reduces reporting lag', entry_type: 'best_practice', domain: 'Knowledge Management', activity_code: 'ACT-003', description: 'Deploying mobile-based data collection tools (KoBoToolbox integrated with the MERL dashboard) reduced the average reporting lag from 3 weeks to 2 days for L&D event documentation. Field officers can now submit reports with GPS coordinates and photos directly from the field.', context: 'Prior to the MERL system deployment, L&D event data was collected using paper forms and manually entered into spreadsheets.', recommendations: 'Continue investment in mobile-first data collection tools. Ensure regular device maintenance and data plan provisioning for field officers.', tags: ['mobile', 'data-collection', 'efficiency', 'digital'], author: 'Tom Natonga', published: true, created_at: '2026-02-01T14:30:00Z', reviewed_by: 'Sarah Johnson' },
  { id: 3, title: 'Limited internet connectivity in outer islands constrains real-time reporting', entry_type: 'challenge', domain: 'Knowledge Management', activity_code: 'ACT-003', description: 'Field officers in Torba and northern Penama provinces frequently experience multi-day periods without internet connectivity, preventing timely submission of L&D event reports and community engagement records. This has resulted in data gaps and delayed response coordination.', context: 'The MERL system was designed with an offline-first approach for the community reporter module, but the main portal still requires connectivity for data submission.', recommendations: 'Expand offline capability beyond the community reporter module. Investigate satellite-based connectivity solutions for remote stations.', tags: ['connectivity', 'remote', 'offline', 'infrastructure'], author: 'James Bani', published: true, created_at: '2025-11-20T09:00:00Z', reviewed_by: null },
  { id: 4, title: 'Integrate GEDSI tracking into all project activities from inception', entry_type: 'recommendation', domain: 'Gender & Social Inclusion', activity_code: 'ACT-005', description: 'The GEDSI assessment revealed that gender and disability disaggregation was not consistently captured in early project activities. Retrofitting GEDSI data collection proved costly and incomplete. Future projects should embed GEDSI tracking mechanisms from the design phase.', context: 'The GEDSI assessment conducted under ACT-005 found that only 40% of early activities had complete gender-disaggregated data.', recommendations: '1. Include mandatory GEDSI fields in all data collection forms from day one.\n2. Provide GEDSI training before project activities commence.\n3. Include GEDSI compliance as a milestone in activity planning.', tags: ['GEDSI', 'gender', 'disability', 'inclusion', 'design'], author: 'Dr. Maria Chen', published: true, created_at: '2026-03-01T11:00:00Z', reviewed_by: 'Sarah Johnson' },
  { id: 5, title: 'Provincial coordination meetings improve cross-sector collaboration', entry_type: 'best_practice', domain: 'Governance', activity_code: 'ACT-001', description: 'Regular quarterly coordination meetings at the provincial level, bringing together DoCC, NDMO, provincial government, and community representatives, have strengthened information sharing and reduced duplication of climate adaptation efforts.', context: 'Before the project established these meetings, climate adaptation activities were often siloed between different government departments and NGOs.', recommendations: 'Institutionalise quarterly coordination meetings through formal MoUs with provincial governments to ensure sustainability beyond the project period.', tags: ['coordination', 'governance', 'provincial', 'collaboration'], author: 'Sarah Johnson', published: true, created_at: '2025-12-10T08:00:00Z', reviewed_by: 'Tom Natonga' },
];

export const DEMO_USERS = [
  { id: 1, username: 'admin', email: 'admin@docc.gov.vu', first_name: 'System', last_name: 'Administrator', role: 'merl-admin', province: '', enabled: true },
  { id: 2, username: 'sjohnson', email: 'sarah.johnson@docc.gov.vu', first_name: 'Sarah', last_name: 'Johnson', role: 'merl-admin', province: '', enabled: true },
  { id: 3, username: 'tnatonga', email: 'tom.natonga@docc.gov.vu', first_name: 'Tom', last_name: 'Natonga', role: 'merl-coordinator', province: 'Shefa', enabled: true },
  { id: 4, username: 'jbani', email: 'james.bani@docc.gov.vu', first_name: 'James', last_name: 'Bani', role: 'merl-coordinator', province: 'Sanma', enabled: true },
  { id: 5, username: 'mchen', email: 'maria.chen@docc.gov.vu', first_name: 'Maria', last_name: 'Chen', role: 'merl-coordinator', province: 'Tafea', enabled: true },
  { id: 6, username: 'rkalo', email: 'ruth.kalo@docc.gov.vu', first_name: 'Ruth', last_name: 'Kalo', role: 'merl-officer', province: 'Malampa', enabled: true },
  { id: 7, username: 'pgeorge', email: 'peter.george@docc.gov.vu', first_name: 'Peter', last_name: 'George', role: 'merl-officer', province: 'Penama', enabled: true },
  { id: 8, username: 'anatu', email: 'anna.natu@docc.gov.vu', first_name: 'Anna', last_name: 'Natu', role: 'merl-officer', province: 'Torba', enabled: true },
  { id: 9, username: 'cmele', email: 'chief.mele@community.vu', first_name: 'Chief', last_name: 'Mele', role: 'merl-community', province: 'Shefa', enabled: true },
  { id: 10, username: 'mfat_observer', email: 'observer@mfat.govt.nz', first_name: 'MFAT', last_name: 'Observer', role: 'merl-donor', province: '', enabled: true },
];

export const DEMO_UPLOADS = [
  { id: 1, filename: 'shefa_engagements_q4_2025.csv', uploaded_at: '2025-12-20T10:30:00Z', status: 'success', rows_imported: 45, rows_failed: 0, data_type: 'engagements', uploaded_by: 'tnatonga' },
  { id: 2, filename: 'ld_events_2025.xlsx', uploaded_at: '2026-01-05T14:00:00Z', status: 'success', rows_imported: 28, rows_failed: 2, data_type: 'events', uploaded_by: 'sjohnson' },
  { id: 3, filename: 'indicator_values_q1_2026.csv', uploaded_at: '2026-03-15T09:00:00Z', status: 'partial', rows_imported: 12, rows_failed: 3, data_type: 'indicators', uploaded_by: 'jbani' },
];

// ── Dashboard summary (derived from demo data) ──────────────────────────────

export const DEMO_DASHBOARD_SUMMARY = {
  indicators: {
    total: DEMO_INDICATORS.length,
    on_track: DEMO_INDICATORS.filter((i) => i.status === 'on_track').length,
    at_risk: DEMO_INDICATORS.filter((i) => i.status === 'at_risk').length,
    off_track: 0,
    completed: DEMO_INDICATORS.filter((i) => i.status === 'completed').length,
    achieved_pct: 67,
  },
  engagement: {
    total_engagements: DEMO_ENGAGEMENTS.length,
    total_participants: DEMO_ENGAGEMENTS.reduce((s, e) => s + e.total_participants, 0),
  },
  financials: {
    total_disbursed_vuv: DEMO_FINANCIAL_SUMMARY.total_disbursed_vuv,
    total_expended_vuv: DEMO_FINANCIAL_SUMMARY.total_expended_vuv,
    remaining_vuv: DEMO_FINANCIAL_SUMMARY.remaining_vuv,
    uncommitted_vuv: DEMO_FINANCIAL_SUMMARY.uncommitted_vuv,
    burn_rate_pct: DEMO_FINANCIAL_SUMMARY.burn_rate_pct,
  },
};

// ── System health ────────────────────────────────────────────────────────────

export const DEMO_SYSTEM_HEALTH = {
  services: [
    { name: 'PostgreSQL', status: 'healthy', details: 'Primary database — v16.2' },
    { name: 'ClickHouse', status: 'healthy', details: 'Analytics database — v24.2' },
    { name: 'Redis', status: 'healthy', details: 'Cache & broker — v7.2' },
    { name: 'PeerDB', status: 'healthy', details: 'CDC replication — lag < 2s' },
    { name: 'Keycloak', status: 'healthy', details: 'Identity — v23.0' },
    { name: 'Airflow', status: 'healthy', details: 'Workflow — v2.8' },
    { name: 'Superset', status: 'healthy', details: 'BI dashboards — v3.1' },
  ],
  stats: {
    db_size: '2.4 GB',
    disk_used: '18.7 GB / 50 GB',
    replication_lag: '< 2 seconds',
  },
  recent_backups: [
    { date: '2026-03-21 02:00', type: 'Daily', status: 'success', size: '2.3 GB' },
    { date: '2026-03-20 02:00', type: 'Daily', status: 'success', size: '2.2 GB' },
    { date: '2026-03-17 02:00', type: 'Weekly', status: 'success', size: '8.1 GB' },
    { date: '2026-03-14 02:00', type: 'Daily', status: 'success', size: '2.1 GB' },
  ],
};
