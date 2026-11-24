-- The stock movements are a journal (docs/PLAN.md, sections 7.14 and 9.6): the stock is their sum,
-- so nobody, the application included, can change or remove one. A mistake is fixed by a new
-- document. TRUNCATE is left alone on purpose: tests empty the tables between runs.
CREATE FUNCTION stock_movements_refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_refuse_change();
