-- Reconcile staging schema drift: executing_agency is free text in the current portal.
-- Safe on databases where the column is already text.
ALTER TABLE merl.projects
  ALTER COLUMN executing_agency TYPE text
  USING executing_agency::text;
