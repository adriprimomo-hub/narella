CREATE TABLE IF NOT EXISTS liquidaciones_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  empleada_id TEXT NOT NULL,
  empleada_nombre TEXT NOT NULL,
  empleada_apellido TEXT,
  desde TIMESTAMPTZ NOT NULL,
  hasta TIMESTAMPTZ NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_comision NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_adelantos NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_neto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_historial_usuario_created
ON liquidaciones_historial(usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_historial_usuario_empleada_created
ON liquidaciones_historial(usuario_id, empleada_id, created_at DESC);

