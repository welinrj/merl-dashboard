-- Source: Department of Climate Change, https://docc.gov.vu/index.php/ndc.
-- National policy targets do not constitute project indicator or actual records.
DO $migration$
DECLARE previous_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  UPDATE merl.projects
  SET category = 'Multi-theme',
      project_type = coalesce(project_type, 'Multi-theme'),
      primary_climate_theme = NULL,
      secondary_climate_themes = ARRAY['Climate Change Adaptation', 'Climate Change Mitigation', 'Loss and Damage'],
      docc_themes = ARRAY['Adaptation', 'Mitigation', 'Loss and Damage'],
      coverage_type = coalesce(coverage_type, 'National'),
      docc_url = 'https://docc.gov.vu/index.php/ndc',
      description = 'Vanuatu’s national climate commitment for 2025–2035 covers adaptation, mitigation, and loss and damage. Vanuatu submitted NDC 3.0 to the UNFCCC on 24 September 2025.'
  WHERE code = 'NDC-3-VU';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The NDC 3.0 portfolio record is missing';
  END IF;

  PERFORM set_config('request.jwt.claim.role', coalesce(previous_role, ''), true);
  PERFORM merl.refresh_public_portal();
  PERFORM merl.refresh_public_indicator_categories();
  PERFORM merl.refresh_public_portal_supplemental();
END;
$migration$;
