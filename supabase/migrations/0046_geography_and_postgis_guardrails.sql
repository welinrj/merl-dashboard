-- Geography and exposed PostGIS guardrails identified by the portal audit.

-- These metadata-estimation RPCs are extension-owned and are not used by the
-- MERL frontend. Keep them out of the anonymous/authenticated PostgREST surface.
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM anon, authenticated;

-- Project locations must use one of Vanuatu's six administrative provinces.
-- NOT VALID preserves historical staging rows (including the existing
-- 'National' placeholder) while enforcing the rule for every new/updated row.
ALTER TABLE merl.project_locations
  ADD CONSTRAINT project_locations_province_vanuatu_ck
  CHECK (
    province IS NULL
    OR upper(btrim(province)) IN ('TORBA','SANMA','PENAMA','MALAMPA','SHEFA','TAFEA')
  ) NOT VALID;
