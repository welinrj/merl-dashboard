-- Reconcile staging schema drift: both fields accept programme-specific free text.
-- Safe on databases where the columns are already text.
ALTER TABLE merl.projects
  ALTER COLUMN funding_window TYPE text USING funding_window::text,
  ALTER COLUMN lead_agency TYPE text USING lead_agency::text;
