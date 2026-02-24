-- Migración: Agregar campo recordatorio_enviado_at a turnos
-- Fecha: 2026-01-27
-- Descripción: Campo para controlar que el recordatorio automático 24hs solo se envíe una vez

ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;

COMMENT ON COLUMN turnos.recordatorio_enviado_at IS 'Fecha/hora en que se envió el recordatorio automático (24hs antes)';

-- Índice para buscar turnos sin recordatorio enviado
CREATE INDEX IF NOT EXISTS idx_turnos_recordatorio_enviado
ON turnos(recordatorio_enviado_at)
WHERE recordatorio_enviado_at IS NULL;
