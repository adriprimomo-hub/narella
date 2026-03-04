-- Harden public schema objects reported by Supabase database linter:
--   - 0010_security_definer_view
--   - 0013_rls_disabled_in_public
--   - 0023_sensitive_columns_exposed

ALTER VIEW IF EXISTS public.v_caja_resumen SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_insumos_stock_bajo SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_turno_servicios_detalle SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_productos_stock_bajo SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_turnos_completos SET (security_invoker = true);

DO $$
DECLARE
  table_name text;
  tables_with_rls text[] := ARRAY[
    'usuarios',
    'configuracion',
    'producto_ventas',
    'empleadas',
    'turno_grupos',
    'turno_servicios',
    'senas',
    'pagos',
    'clientes',
    'servicios',
    'giftcards',
    'pago_grupo_items',
    'adelantos',
    'turnos',
    'servicio_vencido_recordatorios',
    'producto_movimientos',
    'producto_compras',
    'insumo_movimientos',
    'pagos_grupos',
    'productos',
    'caja_movimientos',
    'producto_empleada_comisiones',
    'recordatorios',
    'metodos_pago_config',
    'empleada_ausencias',
    'confirmation_tokens',
    'insumos',
    'liquidaciones_historial',
    'categorias',
    'recursos',
    'facturas',
    'servicio_empleada_comisiones',
    'share_links'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_with_rls LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

-- No policies are added in this migration on purpose.
-- With RLS enabled and no policies, anon/authenticated roles cannot read/write these tables.
-- Server-side code that uses SUPABASE_SERVICE_ROLE_KEY continues to work.
