-- Normalizar tenant_id en instalaciones de un solo local/admin
-- Objetivo: que usuarios no-admin compartan la configuración global del local.

BEGIN;

DO $$
DECLARE
  admin_count INTEGER := 0;
  root_admin_id UUID;
BEGIN
  SELECT COUNT(*)
  INTO admin_count
  FROM usuarios
  WHERE rol = 'admin';

  IF admin_count = 1 THEN
    SELECT id
    INTO root_admin_id
    FROM usuarios
    WHERE rol = 'admin'
    LIMIT 1;
  END IF;

  -- Siempre asegurar que cada admin tenga su propio tenant_id.
  UPDATE usuarios
  SET tenant_id = id,
      updated_at = NOW()
  WHERE rol = 'admin'
    AND (tenant_id IS NULL OR tenant_id <> id);

  -- Solo auto-corregir usuarios no-admin si existe un único admin.
  IF admin_count = 1 AND root_admin_id IS NOT NULL THEN
    UPDATE usuarios
    SET tenant_id = root_admin_id,
        updated_at = NOW()
    WHERE rol <> 'admin'
      AND (tenant_id IS NULL OR tenant_id = id);
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
