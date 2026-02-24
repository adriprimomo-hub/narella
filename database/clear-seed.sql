-- ============================================
-- LIMPIEZA DE DATOS SEED (DEMO)
-- ============================================
-- Este script elimina los datos de ejemplo cargados por database/seed.sql
-- sin borrar los usuarios seed (admin/recepcion). Si queres borrar tambien
-- esos usuarios, mirá la sección OPCION A al final.
--
-- IMPORTANTE:
-- 1) Verificá que estos IDs correspondan a tus usuarios seed.
-- 2) Si estás usando el usuario seed para operar, esta opción conserva
--    el usuario pero elimina todos sus datos (turnos, clientes, servicios, etc).
-- ============================================

BEGIN;

-- IDs de usuarios seed (ver database/seed.sql)
-- admin:    a0000000-0000-0000-0000-000000000001
-- recepcion a0000000-0000-0000-0000-000000000002

-- Datos dependientes (orden para evitar restricciones)
DELETE FROM pago_grupo_items WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM pagos_grupos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM pagos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM senas WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM giftcards WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM turno_servicios WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM recordatorios WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM confirmation_tokens WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM turnos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM turno_grupos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM producto_movimientos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM insumo_movimientos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM servicio_empleada_comisiones WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM producto_empleada_comisiones WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM adelantos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM empleada_ausencias WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM caja_movimientos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM share_links WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

-- Datos base
DELETE FROM productos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM insumos WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM servicios WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM clientes WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM empleadas WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

DELETE FROM configuracion WHERE usuario_id IN (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002'
);

COMMIT;

-- ============================================
-- OPCION A (descomentar si NO usas los usuarios seed)
-- Borra los usuarios seed y todo lo asociado por cascada.
-- ============================================
-- DELETE FROM usuarios WHERE id IN (
--   'a0000000-0000-0000-0000-000000000001',
--   'a0000000-0000-0000-0000-000000000002'
-- );

