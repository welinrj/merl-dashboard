-- Restore the verified VCAP2 Form 8 beneficiary actual and its available
-- sex disaggregation. The source does not report youth, disability,
-- other-gender, or indirect values, so those fields intentionally remain NULL.

DO $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT id INTO v_project_id
  FROM merl.projects
  WHERE code = '23A398';

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'VCAP2 project 23A398 was not found';
  END IF;

  -- Project-scope triggers deliberately allow the service role. Set that claim
  -- only for this transaction so trusted migrations can seed project records.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  INSERT INTO merl.beneficiaries (
    project_id,
    reporting_period,
    total_direct,
    female,
    male,
    other_gender,
    youth,
    persons_with_disability,
    indirect,
    data_source,
    double_counting_check,
    comments
  )
  SELECT
    v_project_id,
    '2025 PIR (to Jun 2025)',
    6684,
    3302,
    3382,
    NULL,
    NULL,
    NULL,
    NULL,
    'Draft 2026 GEF Project Implementation Report (PIR), VCAP2 Mandatory Indicator 11, level at 30 June 2025',
    false,
    'Verified total and sex disaggregation: 6,684 = 3,302 female + 3,382 male. Youth, disability, other-gender and indirect counts were not reported. Indicator 15 training and Indicator 17 awareness figures are components of this total and are not entered separately.'
  WHERE NOT EXISTS (
    SELECT 1
    FROM merl.beneficiaries b
    WHERE b.project_id = v_project_id
      AND b.reporting_period = '2025 PIR (to Jun 2025)'
      AND b.total_direct = 6684
      AND b.female = 3302
      AND b.male = 3382
  );

  IF NOT EXISTS (
    SELECT 1
    FROM merl.beneficiaries b
    WHERE b.project_id = v_project_id
      AND b.reporting_period = '2025 PIR (to Jun 2025)'
      AND b.total_direct = 6684
      AND b.female = 3302
      AND b.male = 3382
      AND b.female + b.male = b.total_direct
  ) THEN
    RAISE EXCEPTION 'VCAP2 beneficiary backfill failed validation';
  END IF;
END $$;
