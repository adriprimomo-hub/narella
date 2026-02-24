-- Elimina estructuras legacy de "adicionales" de punta a punta

BEGIN;

-- Tablas legacy (si existen en instalaciones viejas)
DROP TABLE IF EXISTS turno_adicionales;
DROP TABLE IF EXISTS adicionales;

-- Columnas legacy en pagos (si existen en instalaciones viejas)
ALTER TABLE pagos DROP COLUMN IF EXISTS detalle_adicionales;
ALTER TABLE pagos_grupos DROP COLUMN IF EXISTS detalle_adicionales;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
