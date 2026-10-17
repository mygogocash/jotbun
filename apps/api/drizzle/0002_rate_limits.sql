-- F3: shared request budgets for every API replica. Keys are HMACs computed
-- by the API (RATE_LIMIT_KEY); no raw subject, binding or IP is stored, and
-- rows expire within the hour. RLS with no policies: only the two
-- SECURITY DEFINER routines below can read or write the table.
CREATE TABLE rate_limit_buckets (
  bucket_key text NOT NULL CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 1),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start),
  CHECK (expires_at > window_start AND expires_at <= window_start + interval '24 hours')
);
--> statement-breakpoint
CREATE INDEX rate_limit_buckets_expires_at_idx ON rate_limit_buckets (expires_at);
--> statement-breakpoint
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Counts one request in the current fixed window (database clock, shared by
-- all replicas) and returns the window's hits and seconds until it resets.
CREATE FUNCTION gogospend_consume_rate_limit(p_bucket_key text, p_window_seconds integer)
  RETURNS TABLE (hits integer, retry_after_seconds integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'rate-limit window must be 1 to 3600 seconds';
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rate_limit_buckets AS b (bucket_key, window_start, hits, expires_at)
  VALUES (p_bucket_key, v_window, 1, v_window + make_interval(secs => p_window_seconds) + interval '1 hour')
  ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = b.hits + 1
  RETURNING b.hits INTO hits;
  retry_after_seconds := ceil(extract(epoch FROM (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer;
  RETURN NEXT;
END
$$;
--> statement-breakpoint
CREATE FUNCTION gogospend_purge_rate_limits() RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  WITH purged AS (DELETE FROM public.rate_limit_buckets WHERE expires_at < now() RETURNING 1)
  SELECT count(*)::integer FROM purged
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_consume_rate_limit(text, integer), gogospend_purge_rate_limits() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_consume_rate_limit(text, integer) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_purge_rate_limits() TO gogospend_app;
