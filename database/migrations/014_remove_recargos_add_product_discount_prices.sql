-- Elimina recargos por medio de pago y migra productos a precio lista/descuento

BEGIN;

-- Servicios: mantener solo precio_lista/precio_descuento
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_lista DECIMAL(10, 2);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_descuento DECIMAL(10, 2);

UPDATE servicios
SET precio_lista = precio
WHERE precio_lista IS NULL;

ALTER TABLE servicios ALTER COLUMN precio_lista SET NOT NULL;

ALTER TABLE servicios DROP COLUMN IF EXISTS precios_por_metodo;
ALTER TABLE servicios DROP COLUMN IF EXISTS recargos_por_metodo;

-- Productos: reemplazar precio_venta por precio_lista/precio_descuento
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_lista DECIMAL(10, 2);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_descuento DECIMAL(10, 2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos'
      AND column_name = 'precio_venta'
  ) THEN
    EXECUTE 'UPDATE productos SET precio_lista = precio_venta WHERE precio_lista IS NULL';
  END IF;
END $$;

ALTER TABLE productos ALTER COLUMN precio_lista SET NOT NULL;

-- Evitar dependencia de vista sobre columnas legacy (ej: precio_venta)
DROP VIEW IF EXISTS v_productos_stock_bajo;

ALTER TABLE productos DROP COLUMN IF EXISTS precio_venta;

CREATE OR REPLACE VIEW v_productos_stock_bajo AS
SELECT
  p.*,
  (p.stock_minimo - p.stock_actual) AS cantidad_faltante
FROM productos p
WHERE p.stock_actual <= p.stock_minimo
  AND p.activo = true
ORDER BY p.stock_actual ASC;

COMMENT ON VIEW v_productos_stock_bajo IS 'Productos con stock por debajo del mínimo';

-- Métodos de pago: sin ajustes/recargos
ALTER TABLE metodos_pago_config ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE metodos_pago_config DROP COLUMN IF EXISTS ajuste_tipo;
ALTER TABLE metodos_pago_config DROP COLUMN IF EXISTS ajuste_valor;

INSERT INTO metodos_pago_config (nombre, activo)
VALUES
  ('efectivo', true),
  ('tarjeta', true),
  ('transferencia', true)
ON CONFLICT (nombre) DO NOTHING;

COMMENT ON TABLE metodos_pago_config IS 'Configuración de métodos de pago habilitados';

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
