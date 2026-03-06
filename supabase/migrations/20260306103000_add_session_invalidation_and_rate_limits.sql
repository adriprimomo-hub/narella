-- Session invalidation + shared API rate limit windows.

ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS session_invalid_before TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
ON public.api_rate_limits(reset_at);

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_ms BIGINT
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at BIGINT,
  retry_after INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_count INTEGER;
  row_reset TIMESTAMPTZ;
  window_interval INTERVAL;
BEGIN
  IF COALESCE(length(trim(p_key)), 0) = 0 THEN
    RAISE EXCEPTION 'consume_api_rate_limit: key requerido'
      USING ERRCODE = '22023';
  END IF;

  IF p_max <= 0 THEN
    RAISE EXCEPTION 'consume_api_rate_limit: max debe ser mayor a 0'
      USING ERRCODE = '22023';
  END IF;

  IF p_window_ms <= 0 THEN
    RAISE EXCEPTION 'consume_api_rate_limit: window_ms debe ser mayor a 0'
      USING ERRCODE = '22023';
  END IF;

  window_interval := (p_window_ms::TEXT || ' milliseconds')::INTERVAL;

  LOOP
    UPDATE public.api_rate_limits
    SET
      count = CASE
        WHEN reset_at <= NOW() THEN 1
        ELSE count + 1
      END,
      reset_at = CASE
        WHEN reset_at <= NOW() THEN NOW() + window_interval
        ELSE reset_at
      END,
      updated_at = NOW()
    WHERE key = p_key
    RETURNING count, reset_at
    INTO row_count, row_reset;

    EXIT WHEN FOUND;

    BEGIN
      INSERT INTO public.api_rate_limits (key, count, reset_at, created_at, updated_at)
      VALUES (p_key, 1, NOW() + window_interval, NOW(), NOW())
      RETURNING count, reset_at
      INTO row_count, row_reset;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        -- Retry when another concurrent request inserted the same key first.
    END;
  END LOOP;

  allowed := row_count <= p_max;
  remaining := GREATEST(p_max - row_count, 0);
  reset_at := FLOOR(EXTRACT(EPOCH FROM row_reset) * 1000)::BIGINT;

  IF allowed THEN
    retry_after := NULL;
  ELSE
    retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (row_reset - NOW())))::INTEGER);
  END IF;

  RETURN NEXT;
END;
$$;
