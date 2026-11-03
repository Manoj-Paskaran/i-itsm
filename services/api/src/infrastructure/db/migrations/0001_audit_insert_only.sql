CREATE FUNCTION audit_records_insert_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_records is insert-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_records_insert_only_trigger
BEFORE UPDATE OR DELETE ON audit_records
FOR EACH ROW EXECUTE FUNCTION audit_records_insert_only();
