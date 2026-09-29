import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const summary = readFileSync(new URL('../src/components/ui/BeneficiarySummary.jsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260929032027_restore_vcap2_beneficiary_disaggregation.sql', import.meta.url), 'utf8');

test('beneficiary card excludes completed projects consistently with the dashboard', () => {
  assert.match(summary, /bucketOf\(p\.status\) !== 'completed'/);
  assert.match(summary, /projectMatches\(p, filters\)/);
});

test('VCAP2 backfill preserves the verified disaggregation and missing dimensions', () => {
  assert.match(migration, /'2025 PIR \(to Jun 2025\)'/);
  assert.match(migration, /6684[\s\S]*3302[\s\S]*3382/);
  assert.match(migration, /b\.female \+ b\.male = b\.total_direct/);
  assert.match(migration, /other_gender,[\s\S]*youth,[\s\S]*persons_with_disability,[\s\S]*indirect,[\s\S]*data_source,[\s\S]*double_counting_check,[\s\S]*comments[\s\S]*3302,[\s\S]*3382,[\s\S]*NULL,[\s\S]*NULL,[\s\S]*NULL,[\s\S]*NULL,/);
  assert.match(migration, /NOT EXISTS/);
});
