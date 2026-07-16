-- =============================================================================
-- MERL Dashboard – Migration 0012: remove demonstration seed data
-- =============================================================================
-- Clears the VCCRP / VCAP2 demonstration dataset seeded by 0001/0004/0006 so
-- the portal shows only real data (the DoCC Strategic Plan in srf_activities,
-- real project registrations, users, datasets and audit logs). The analysis
-- tables below are populated only by the demo seed, so they are emptied.
-- =============================================================================

BEGIN;

DELETE FROM merl.indicator_values;
DELETE FROM merl.activity_milestones;
DELETE FROM merl.financial_transactions;
DELETE FROM merl.indicators;
DELETE FROM merl.activities;
DELETE FROM merl.community_engagements;
DELETE FROM merl.ld_events;
DELETE FROM merl.learning_entries;

-- Drop the demonstration projects, keeping any real registrations.
DELETE FROM merl.projects WHERE code IN ('VCAP2', 'VCAP2-001', 'VCCRP-001');

COMMIT;
