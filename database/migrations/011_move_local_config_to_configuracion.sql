-- Mover horario_local a configuración global del local
-- y eliminar columnas legacy en usuarios

BEGIN;

CREATE TABLE IF NOT EXISTS configuracion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  horario_local JSONB DEFAULT '[]'::jsonb,
  nombre_local VARCHAR(150),
  direccion TEXT,
  telefono VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill desde usuarios (si existían las columnas legacy)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'horario_local'
  ) THEN
    INSERT INTO configuracion (usuario_id, horario_local, created_at, updated_at)
    SELECT u.id, COALESCE(u.horario_local, '[]'::jsonb), NOW(), NOW()
    FROM usuarios u
    WHERE u.rol = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM configuracion c WHERE c.usuario_id = u.id
      );

    INSERT INTO configuracion (usuario_id, horario_local, created_at, updated_at)
    SELECT DISTINCT COALESCE(u.tenant_id, u.id), '[]'::jsonb, NOW(), NOW()
    FROM usuarios u
    WHERE NOT EXISTS (
      SELECT 1 FROM configuracion c WHERE c.usuario_id = COALESCE(u.tenant_id, u.id)
    );

    UPDATE configuracion c
    SET
      horario_local = u.horario_local,
      updated_at = NOW()
    FROM usuarios u
    WHERE u.id = c.usuario_id
      AND u.rol = 'admin'
      AND (c.horario_local IS NULL OR c.horario_local = '[]'::jsonb)
      AND u.horario_local IS NOT NULL;
  END IF;
END $$;

-- Mantener un único registro por usuario/tenant en configuracion
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY usuario_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM configuracion
)
DELETE FROM configuracion c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS idx_configuracion_usuario_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_configuracion_usuario_id ON configuracion(usuario_id);

ALTER TABLE usuarios DROP COLUMN IF EXISTS telefono_whatsapp;
ALTER TABLE usuarios DROP COLUMN IF EXISTS horario_local;

COMMENT ON TABLE configuracion IS 'Configuración global del local por tenant';
COMMENT ON COLUMN configuracion.horario_local IS 'Horarios de atención del local en formato JSON';

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
