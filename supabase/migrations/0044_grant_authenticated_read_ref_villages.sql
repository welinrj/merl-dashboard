-- The security-invoker village view reads merl.ref_villages as the caller.
-- Signed-in portal users need SELECT on the backing gazetteer; anonymous users do not.
REVOKE ALL ON TABLE merl.ref_villages FROM anon;
GRANT SELECT ON TABLE merl.ref_villages TO authenticated;
