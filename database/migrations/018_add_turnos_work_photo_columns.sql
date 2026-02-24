-- Migración: agregar foto del trabajo al turno (una foto por turno)

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS foto_trabajo_base64 TEXT,
  ADD COLUMN IF NOT EXISTS foto_trabajo_storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS foto_trabajo_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS foto_trabajo_mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_turnos_foto_trabajo_storage_path
ON turnos(foto_trabajo_storage_path)
WHERE foto_trabajo_storage_path IS NOT NULL;

COMMENT ON COLUMN turnos.foto_trabajo_storage_bucket IS 'Bucket de Storage para la foto del trabajo del turno';
COMMENT ON COLUMN turnos.foto_trabajo_storage_path IS 'Path del objeto en Storage para la foto del trabajo del turno';
