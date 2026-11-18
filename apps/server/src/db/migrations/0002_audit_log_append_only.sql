-- The audit log is append-only (docs/PLAN.md, sections 7.3 and 15): nobody, the application
-- included, can change or remove an entry. TRUNCATE is left alone on purpose: tests empty the
-- tables between runs.
CREATE FUNCTION audit_log_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_refuse_change();
