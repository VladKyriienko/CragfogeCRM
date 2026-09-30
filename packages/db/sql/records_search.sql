-- Full-text search maintenance for records.name + string values in data.
CREATE OR REPLACE FUNCTION records_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A')
    || setweight(
      to_tsvector(
        'simple',
        coalesce(
          (
            SELECT string_agg(kv.value, ' ')
            FROM jsonb_each_text(NEW.data) AS kv(key, value)
            WHERE jsonb_typeof(NEW.data -> kv.key) = 'string'
          ),
          ''
        )
      ),
      'B'
    );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS records_search_trigger ON records;
CREATE TRIGGER records_search_trigger
  BEFORE INSERT OR UPDATE OF name, data ON records
  FOR EACH ROW
  EXECUTE FUNCTION records_search_update();
