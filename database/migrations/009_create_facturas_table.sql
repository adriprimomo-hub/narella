-- Crear tabla de facturas para historial y compartir PDFs
-- Necesaria para /api/facturas, /api/compartir y guardado de comprobantes emitidos

BEGIN;

CREATE TABLE IF NOT EXISTS facturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  tipo VARCHAR(20) NOT NULL DEFAULT 'factura',
  estado VARCHAR(30) NOT NULL DEFAULT 'emitida',

  factura_relacionada_id UUID REFERENCES facturas(id) ON DELETE SET NULL,
  nota_credito_id UUID REFERENCES facturas(id) ON DELETE SET NULL,

  origen_tipo VARCHAR(50),
  origen_id UUID,

  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(150),
  cliente_apellido VARCHAR(150),

  metodo_pago VARCHAR(50),
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  fecha TIMESTAMPTZ,

  punto_venta INTEGER,
  numero INTEGER,
  cbte_tipo INTEGER,
  cae VARCHAR(50),
  cae_vto VARCHAR(20),

  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  descuento_sena DECIMAL(12, 2),

  pdf_base64 TEXT,
  pdf_filename TEXT,
  nota TEXT,

  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_username VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturas_tipo_check'
      AND conrelid = 'facturas'::regclass
  ) THEN
    ALTER TABLE facturas
      ADD CONSTRAINT facturas_tipo_check
      CHECK (tipo IN ('factura', 'nota_credito'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturas_estado_check'
      AND conrelid = 'facturas'::regclass
  ) THEN
    ALTER TABLE facturas
      ADD CONSTRAINT facturas_estado_check
      CHECK (estado IN ('emitida', 'con_nota_credito', 'anulada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_facturas_usuario_id ON facturas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_tipo_estado ON facturas(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_facturas_origen ON facturas(origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_id ON facturas(cliente_id);

COMMENT ON TABLE facturas IS 'Comprobantes emitidos (facturas y notas de credito)';
COMMENT ON COLUMN facturas.items IS 'Detalle de items facturados';
COMMENT ON COLUMN facturas.pdf_base64 IS 'PDF del comprobante en base64';

-- Refrescar cache de PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
