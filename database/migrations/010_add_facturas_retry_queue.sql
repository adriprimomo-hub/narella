-- Soporte para facturas pendientes y reintentos automáticos de ARCA/AFIP

BEGIN;

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS retry_payload JSONB,
  ADD COLUMN IF NOT EXISTS retry_intentos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_ultimo_error TEXT,
  ADD COLUMN IF NOT EXISTS retry_ultimo_intento TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_proximo_intento TIMESTAMPTZ;

-- Ampliar estados permitidos para contemplar comprobantes pendientes de emisión
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facturas_estado_check'
      AND conrelid = 'facturas'::regclass
  ) THEN
    ALTER TABLE facturas DROP CONSTRAINT facturas_estado_check;
  END IF;

  ALTER TABLE facturas
    ADD CONSTRAINT facturas_estado_check
    CHECK (estado IN ('emitida', 'pendiente', 'con_nota_credito', 'anulada'));
END $$;

CREATE INDEX IF NOT EXISTS idx_facturas_retry_pendientes
  ON facturas (retry_proximo_intento)
  WHERE estado = 'pendiente';

COMMENT ON COLUMN facturas.retry_payload IS 'Payload para reintentar emisión de factura en ARCA/AFIP';
COMMENT ON COLUMN facturas.retry_intentos IS 'Cantidad de reintentos automáticos realizados';
COMMENT ON COLUMN facturas.retry_ultimo_error IS 'Último error devuelto por ARCA/AFIP durante el reintento';
COMMENT ON COLUMN facturas.retry_ultimo_intento IS 'Fecha/hora del último intento automático';
COMMENT ON COLUMN facturas.retry_proximo_intento IS 'Fecha/hora programada para el próximo reintento automático';

-- Refrescar cache de PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
