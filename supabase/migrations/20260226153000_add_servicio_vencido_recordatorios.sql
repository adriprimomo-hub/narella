CREATE TABLE IF NOT EXISTS servicio_vencido_recordatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  servicio_id UUID NOT NULL,
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servicio_vencido_recordatorios_unique
ON servicio_vencido_recordatorios(usuario_id, cliente_id, servicio_id);

CREATE INDEX IF NOT EXISTS idx_servicio_vencido_recordatorios_usuario_enviado
ON servicio_vencido_recordatorios(usuario_id, enviado_at DESC);
