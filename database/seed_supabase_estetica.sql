-- ============================================
-- SEED DEMO - CENTRO DE ESTETICA (SUPABASE)
-- ============================================
-- Incluye: clientes, empleadas, servicios, productos,
-- historial, liquidaciones (pagos/comisiones/adelantos),
-- senas, turnos simultaneos y giftcards.
--
-- Usuario demo:
-- username: demo_admin_estetica
-- password: admin
-- ============================================

BEGIN;

SET TIME ZONE 'America/Argentina/Buenos_Aires';

-- bcrypt hash de "admin"
-- $2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK

-- ============================================
-- LIMPIEZA (solo IDs de este seed)
-- ============================================

DELETE FROM confirmation_tokens WHERE id IN (
  '90cd0000-0000-4000-8000-000000000001',
  '90cd0000-0000-4000-8000-000000000002'
);

DELETE FROM recordatorios WHERE id IN (
  '90ce0000-0000-4000-8000-000000000001',
  '90ce0000-0000-4000-8000-000000000002'
);

DELETE FROM caja_movimientos WHERE id IN (
  '90cc0000-0000-4000-8000-000000000001',
  '90cc0000-0000-4000-8000-000000000002',
  '90cc0000-0000-4000-8000-000000000003',
  '90cc0000-0000-4000-8000-000000000004',
  '90cc0000-0000-4000-8000-000000000005',
  '90cc0000-0000-4000-8000-000000000006'
);

DELETE FROM insumo_movimientos WHERE id IN (
  '90b10000-0000-4000-8000-000000000001',
  '90b10000-0000-4000-8000-000000000002',
  '90b10000-0000-4000-8000-000000000003',
  '90b10000-0000-4000-8000-000000000004'
);

DELETE FROM producto_movimientos WHERE id IN (
  '90ac0000-0000-4000-8000-000000000001',
  '90ac0000-0000-4000-8000-000000000002',
  '90ac0000-0000-4000-8000-000000000003',
  '90ac0000-0000-4000-8000-000000000004',
  '90ac0000-0000-4000-8000-000000000005',
  '90ac0000-0000-4000-8000-000000000006',
  '90ac0000-0000-4000-8000-000000000007',
  '90ac0000-0000-4000-8000-000000000008',
  '90ac0000-0000-4000-8000-000000000009'
);

DELETE FROM adelantos WHERE id IN (
  '90ffffff-ffff-4fff-8fff-fffffffff001',
  '90ffffff-ffff-4fff-8fff-fffffffff002',
  '90ffffff-ffff-4fff-8fff-fffffffff003'
);

DELETE FROM pago_grupo_items WHERE id IN (
  '90eeeeee-eeee-4eee-8eee-eeeeeeeeee01',
  '90eeeeee-eeee-4eee-8eee-eeeeeeeeee02'
);

DELETE FROM pagos_grupos WHERE id = '90dddddd-dddd-4ddd-8ddd-dddddddddd01';

DELETE FROM pagos WHERE id IN (
  '90cccccc-cccc-4ccc-8ccc-cccccccccc01',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc02',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc03',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc04',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc05',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc06',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc07',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc08',
  '90cccccc-cccc-4ccc-8ccc-cccccccccc09'
);

DELETE FROM turno_servicios WHERE id IN (
  '90999999-9999-4999-8999-999999999901',
  '90999999-9999-4999-8999-999999999902',
  '90999999-9999-4999-8999-999999999903',
  '90999999-9999-4999-8999-999999999904',
  '90999999-9999-4999-8999-999999999905',
  '90999999-9999-4999-8999-999999999906',
  '90999999-9999-4999-8999-999999999907'
);

DELETE FROM senas WHERE id IN (
  '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
  '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03'
);

DELETE FROM giftcards WHERE id IN (
  '90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
  '90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02',
  '90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03'
);

DELETE FROM empleada_ausencias WHERE id = '90ca0000-0000-4000-8000-000000000001';

DELETE FROM turnos WHERE id IN (
  '90888888-8888-4888-8888-888888888801',
  '90888888-8888-4888-8888-888888888802',
  '90888888-8888-4888-8888-888888888803',
  '90888888-8888-4888-8888-888888888804',
  '90888888-8888-4888-8888-888888888805',
  '90888888-8888-4888-8888-888888888806',
  '90888888-8888-4888-8888-888888888807',
  '90888888-8888-4888-8888-888888888808',
  '90888888-8888-4888-8888-888888888809',
  '90888888-8888-4888-8888-88888888880a',
  '90888888-8888-4888-8888-88888888880b',
  '90888888-8888-4888-8888-88888888880c',
  '90888888-8888-4888-8888-88888888880d',
  '90888888-8888-4888-8888-88888888880e',
  '90888888-8888-4888-8888-88888888880f',
  '90888888-8888-4888-8888-888888888810'
);

DELETE FROM turno_grupos WHERE id IN (
  '90777777-7777-4777-8777-777777777701',
  '90777777-7777-4777-8777-777777777702'
);

DELETE FROM producto_empleada_comisiones WHERE usuario_id = '90111111-1111-4111-8111-111111111111';
DELETE FROM servicio_empleada_comisiones WHERE usuario_id = '90111111-1111-4111-8111-111111111111';

DELETE FROM productos WHERE id IN (
  '90555555-5555-4555-8555-555555555501',
  '90555555-5555-4555-8555-555555555502',
  '90555555-5555-4555-8555-555555555503',
  '90555555-5555-4555-8555-555555555504',
  '90555555-5555-4555-8555-555555555505',
  '90555555-5555-4555-8555-555555555506',
  '90555555-5555-4555-8555-555555555507'
);

DELETE FROM insumos WHERE id IN (
  '90666666-6666-4666-8666-666666666601',
  '90666666-6666-4666-8666-666666666602',
  '90666666-6666-4666-8666-666666666603'
);

DELETE FROM servicios WHERE id IN (
  '90444444-4444-4444-8444-444444444401',
  '90444444-4444-4444-8444-444444444402',
  '90444444-4444-4444-8444-444444444403',
  '90444444-4444-4444-8444-444444444404',
  '90444444-4444-4444-8444-444444444405',
  '90444444-4444-4444-8444-444444444406',
  '90444444-4444-4444-8444-444444444407',
  '90444444-4444-4444-8444-444444444408'
);

DELETE FROM clientes WHERE id IN (
  '90333333-3333-4333-8333-333333333301',
  '90333333-3333-4333-8333-333333333302',
  '90333333-3333-4333-8333-333333333303',
  '90333333-3333-4333-8333-333333333304',
  '90333333-3333-4333-8333-333333333305',
  '90333333-3333-4333-8333-333333333306',
  '90333333-3333-4333-8333-333333333307',
  '90333333-3333-4333-8333-333333333308'
);

DELETE FROM empleadas WHERE id IN (
  '90222222-2222-4222-8222-222222222221',
  '90222222-2222-4222-8222-222222222222',
  '90222222-2222-4222-8222-222222222223',
  '90222222-2222-4222-8222-222222222224',
  '90222222-2222-4222-8222-222222222225'
);

DELETE FROM configuracion WHERE id = '90c0c0c0-c0c0-40c0-80c0-c0c0c0c0c001';

DELETE FROM usuarios WHERE id IN (
  '90111111-1111-4111-8111-111111111111',
  '90111111-1111-4111-8111-111111111112',
  '90111111-1111-4111-8111-111111111113',
  '90111111-1111-4111-8111-111111111114',
  '90111111-1111-4111-8111-111111111115'
);

-- ============================================
-- USUARIOS Y CONFIG
-- ============================================

INSERT INTO usuarios (id, username, password_hash, rol, tenant_id, empleada_id, created_at, updated_at)
VALUES
  ('90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', '$2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK', 'admin', '90111111-1111-4111-8111-111111111111', NULL, NOW() - INTERVAL '18 months', NOW()),
  ('90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', '$2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK', 'recepcion', '90111111-1111-4111-8111-111111111111', NULL, NOW() - INTERVAL '17 months', NOW()),
  ('90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', '$2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK', 'caja', '90111111-1111-4111-8111-111111111111', NULL, NOW() - INTERVAL '17 months', NOW()),
  ('90111111-1111-4111-8111-111111111114', 'demo_staff_unas', '$2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK', 'staff', '90111111-1111-4111-8111-111111111111', NULL, NOW() - INTERVAL '14 months', NOW()),
  ('90111111-1111-4111-8111-111111111115', 'demo_staff_pestanas', '$2a$10$kv/amskcGi9D4YQgxm7siOQViQT2zRY4sBRvY9w7femyFCMoXsNoK', 'staff', '90111111-1111-4111-8111-111111111111', NULL, NOW() - INTERVAL '14 months', NOW());

INSERT INTO configuracion (id, usuario_id, horario_local, nombre_local, direccion, telefono, created_at, updated_at)
VALUES (
  '90c0c0c0-c0c0-40c0-80c0-c0c0c0c0c001',
  '90111111-1111-4111-8111-111111111111',
  '[
    {"dia":0,"desde":"","hasta":"","activo":false},
    {"dia":1,"desde":"09:00","hasta":"20:00","activo":true},
    {"dia":2,"desde":"09:00","hasta":"20:00","activo":true},
    {"dia":3,"desde":"09:00","hasta":"20:00","activo":true},
    {"dia":4,"desde":"09:00","hasta":"20:00","activo":true},
    {"dia":5,"desde":"09:00","hasta":"20:00","activo":true},
    {"dia":6,"desde":"10:00","hasta":"16:00","activo":true}
  ]'::jsonb,
  'Demo Estetica Integral',
  'Av. Siempreviva 742, CABA',
  '+54 11 4040-9090',
  NOW() - INTERVAL '18 months',
  NOW()
);

INSERT INTO metodos_pago_config (nombre, activo, created_at)
VALUES
  ('efectivo', true, NOW() - INTERVAL '2 years'),
  ('tarjeta', true, NOW() - INTERVAL '2 years'),
  ('transferencia', true, NOW() - INTERVAL '2 years'),
  ('mercadopago', true, NOW() - INTERVAL '1 year'),
  ('giftcard', true, NOW() - INTERVAL '1 year')
ON CONFLICT (nombre) DO UPDATE
SET activo = EXCLUDED.activo;

-- ============================================
-- EMPLEADAS Y CLIENTES
-- ============================================

INSERT INTO empleadas (id, usuario_id, nombre, apellido, telefono, activo, horarios, created_at, updated_at)
VALUES
  ('90222222-2222-4222-8222-222222222221', '90111111-1111-4111-8111-111111111111', 'Paula', 'Rivas', '1130001001', true, '[{"dia":1,"desde":"09:00","hasta":"17:00"},{"dia":2,"desde":"09:00","hasta":"17:00"},{"dia":3,"desde":"09:00","hasta":"17:00"},{"dia":4,"desde":"10:00","hasta":"18:00"},{"dia":5,"desde":"10:00","hasta":"18:00"}]'::jsonb, NOW() - INTERVAL '16 months', NOW()),
  ('90222222-2222-4222-8222-222222222222', '90111111-1111-4111-8111-111111111111', 'Melina', 'Soto', '1130001002', true, '[{"dia":1,"desde":"10:00","hasta":"18:00"},{"dia":2,"desde":"10:00","hasta":"18:00"},{"dia":3,"desde":"10:00","hasta":"18:00"},{"dia":4,"desde":"10:00","hasta":"18:00"},{"dia":6,"desde":"10:00","hasta":"15:00"}]'::jsonb, NOW() - INTERVAL '16 months', NOW()),
  ('90222222-2222-4222-8222-222222222223', '90111111-1111-4111-8111-111111111111', 'Abril', 'Diaz', '1130001003', true, '[{"dia":1,"desde":"12:00","hasta":"20:00"},{"dia":2,"desde":"12:00","hasta":"20:00"},{"dia":4,"desde":"12:00","hasta":"20:00"},{"dia":5,"desde":"12:00","hasta":"20:00"}]'::jsonb, NOW() - INTERVAL '14 months', NOW()),
  ('90222222-2222-4222-8222-222222222224', '90111111-1111-4111-8111-111111111111', 'Julieta', 'Mena', '1130001004', true, '[{"dia":2,"desde":"09:00","hasta":"17:00"},{"dia":3,"desde":"09:00","hasta":"17:00"},{"dia":4,"desde":"09:00","hasta":"17:00"},{"dia":5,"desde":"09:00","hasta":"17:00"},{"dia":6,"desde":"10:00","hasta":"16:00"}]'::jsonb, NOW() - INTERVAL '14 months', NOW()),
  ('90222222-2222-4222-8222-222222222225', '90111111-1111-4111-8111-111111111111', 'Lucia', 'Ferrer', '1130001005', true, '[{"dia":1,"desde":"09:00","hasta":"16:00"},{"dia":3,"desde":"09:00","hasta":"16:00"},{"dia":5,"desde":"09:00","hasta":"16:00"}]'::jsonb, NOW() - INTERVAL '10 months', NOW());

UPDATE usuarios SET empleada_id = '90222222-2222-4222-8222-222222222221' WHERE id = '90111111-1111-4111-8111-111111111114';
UPDATE usuarios SET empleada_id = '90222222-2222-4222-8222-222222222224' WHERE id = '90111111-1111-4111-8111-111111111115';

INSERT INTO clientes (id, usuario_id, nombre, apellido, telefono, observaciones, created_at, updated_at)
VALUES
  ('90333333-3333-4333-8333-333333333301', '90111111-1111-4111-8111-111111111111', 'Camila', 'Torres', '1150010001', 'Prefiere tonos nude en manos', NOW() - INTERVAL '17 months', NOW()),
  ('90333333-3333-4333-8333-333333333302', '90111111-1111-4111-8111-111111111111', 'Valentina', 'Rojas', '1150010002', 'Suele reservar con anticipacion', NOW() - INTERVAL '17 months', NOW()),
  ('90333333-3333-4333-8333-333333333303', '90111111-1111-4111-8111-111111111111', 'Sofia', 'Benitez', '1150010003', 'Consulta productos para pestanas', NOW() - INTERVAL '16 months', NOW()),
  ('90333333-3333-4333-8333-333333333304', '90111111-1111-4111-8111-111111111111', 'Martina', 'Quiroga', '1150010004', NULL, NOW() - INTERVAL '15 months', NOW()),
  ('90333333-3333-4333-8333-333333333305', '90111111-1111-4111-8111-111111111111', 'Carla', 'Medina', '1150010005', 'Pide masajes por cervicalgia', NOW() - INTERVAL '14 months', NOW()),
  ('90333333-3333-4333-8333-333333333306', '90111111-1111-4111-8111-111111111111', 'Julieta', 'Paz', '1150010006', NULL, NOW() - INTERVAL '13 months', NOW()),
  ('90333333-3333-4333-8333-333333333307', '90111111-1111-4111-8111-111111111111', 'Agustina', 'Luna', '1150010007', 'Se hace combos manos + pestanas', NOW() - INTERVAL '12 months', NOW()),
  ('90333333-3333-4333-8333-333333333308', '90111111-1111-4111-8111-111111111111', 'Micaela', 'Suarez', '1150010008', 'Compra giftcards para regalar', NOW() - INTERVAL '11 months', NOW());

-- ============================================
-- SERVICIOS, PRODUCTOS E INSUMOS
-- ============================================

INSERT INTO servicios (
  id, usuario_id, nombre, precio, precio_lista, precio_descuento, duracion_minutos, activo, categoria,
  comision_pct, comision_monto_fijo, empleadas_habilitadas,
  created_at, updated_at
)
VALUES
  ('90444444-4444-4444-8444-444444444401', '90111111-1111-4111-8111-111111111111', 'Manicuria clasica', 18000, 18000, 16500, 45, true, 'manos', 35, 0, '["90222222-2222-4222-8222-222222222221","90222222-2222-4222-8222-222222222225"]'::jsonb, NOW() - INTERVAL '16 months', NOW()),
  ('90444444-4444-4444-8444-444444444402', '90111111-1111-4111-8111-111111111111', 'Kapping gel', 32000, 32000, 30000, 75, true, 'manos', 40, 0, '["90222222-2222-4222-8222-222222222221"]'::jsonb, NOW() - INTERVAL '15 months', NOW()),
  ('90444444-4444-4444-8444-444444444403', '90111111-1111-4111-8111-111111111111', 'Pedicuria spa', 26000, 26000, 24500, 60, true, 'pies', 36, 0, '["90222222-2222-4222-8222-222222222222","90222222-2222-4222-8222-222222222225"]'::jsonb, NOW() - INTERVAL '15 months', NOW()),
  ('90444444-4444-4444-8444-444444444404', '90111111-1111-4111-8111-111111111111', 'Belleza de pies + semipermanente', 34000, 34000, 32000, 80, true, 'pies', 38, 0, '["90222222-2222-4222-8222-222222222222"]'::jsonb, NOW() - INTERVAL '14 months', NOW()),
  ('90444444-4444-4444-8444-444444444405', '90111111-1111-4111-8111-111111111111', 'Masaje descontracturante 50m', 28000, 28000, 26000, 50, true, 'masajes', 37, 0, '["90222222-2222-4222-8222-222222222223","90222222-2222-4222-8222-222222222225"]'::jsonb, NOW() - INTERVAL '14 months', NOW()),
  ('90444444-4444-4444-8444-444444444406', '90111111-1111-4111-8111-111111111111', 'Drenaje linfatico 60m', 32000, 32000, 30000, 60, true, 'masajes', 39, 0, '["90222222-2222-4222-8222-222222222223"]'::jsonb, NOW() - INTERVAL '13 months', NOW()),
  ('90444444-4444-4444-8444-444444444407', '90111111-1111-4111-8111-111111111111', 'Lifting de pestanas', 30000, 30000, 28500, 70, true, 'pestanas', 40, 0, '["90222222-2222-4222-8222-222222222224"]'::jsonb, NOW() - INTERVAL '13 months', NOW()),
  ('90444444-4444-4444-8444-444444444408', '90111111-1111-4111-8111-111111111111', 'Nail art premium', 12000, 12000, 11000, 25, true, 'adicional', 30, 0, '["90222222-2222-4222-8222-222222222221"]'::jsonb, NOW() - INTERVAL '9 months', NOW());

INSERT INTO productos (
  id, usuario_id, nombre, descripcion, stock_actual, stock_minimo, precio_lista, precio_descuento, activo,
  comision_pct, comision_monto_fijo, creado_por_username, created_at, updated_at
)
VALUES
  ('90555555-5555-4555-8555-555555555501', '90111111-1111-4111-8111-111111111111', 'Aceite de cuticulas 15ml', 'Hidratacion diaria para cuticulas.', 33, 8, 9800, 9200, true, 10, 0, 'demo_admin_estetica', NOW() - INTERVAL '14 months', NOW()),
  ('90555555-5555-4555-8555-555555555502', '90111111-1111-4111-8111-111111111111', 'Exfoliante para pies', 'Exfoliante con piedra volcanica.', 24, 6, 14200, 13500, true, 12, 0, 'demo_admin_estetica', NOW() - INTERVAL '14 months', NOW()),
  ('90555555-5555-4555-8555-555555555503', '90111111-1111-4111-8111-111111111111', 'Serum fortalecedor de pestanas', 'Uso nocturno sin perfume.', 19, 5, 16500, 15700, true, 15, 0, 'demo_admin_estetica', NOW() - INTERVAL '13 months', NOW()),
  ('90555555-5555-4555-8555-555555555504', '90111111-1111-4111-8111-111111111111', 'Esmalte semipermanente nude', 'Linea hipoalergenica.', 37, 10, 6200, 5900, true, 8, 0, 'demo_admin_estetica', NOW() - INTERVAL '13 months', NOW()),
  ('90555555-5555-4555-8555-555555555505', '90111111-1111-4111-8111-111111111111', 'Mascara facial hidratante', 'Con acido hialuronico.', 17, 8, 7900, 7500, true, 9, 0, 'demo_admin_estetica', NOW() - INTERVAL '12 months', NOW()),
  ('90555555-5555-4555-8555-555555555506', '90111111-1111-4111-8111-111111111111', 'Sales de bano relajantes', 'Aroma lavanda suave.', 12, 5, 8600, 8200, true, 8, 0, 'demo_admin_estetica', NOW() - INTERVAL '12 months', NOW()),
  ('90555555-5555-4555-8555-555555555507', '90111111-1111-4111-8111-111111111111', 'Crema de manos con urea', 'Reparacion intensiva.', 10, 4, 7300, 6900, true, 8, 0, 'demo_admin_estetica', NOW() - INTERVAL '11 months', NOW());

INSERT INTO insumos (id, usuario_id, nombre, stock_actual, stock_minimo, activo, creado_por_username, created_at, updated_at)
VALUES
  ('90666666-6666-4666-8666-666666666601', '90111111-1111-4111-8111-111111111111', 'Guantes nitrilo', 220, 80, true, 'demo_admin_estetica', NOW() - INTERVAL '14 months', NOW()),
  ('90666666-6666-4666-8666-666666666602', '90111111-1111-4111-8111-111111111111', 'Limas descartables', 300, 120, true, 'demo_admin_estetica', NOW() - INTERVAL '14 months', NOW()),
  ('90666666-6666-4666-8666-666666666603', '90111111-1111-4111-8111-111111111111', 'Toallas descartables', 460, 180, true, 'demo_admin_estetica', NOW() - INTERVAL '13 months', NOW());

INSERT INTO servicio_empleada_comisiones (usuario_id, servicio_id, empleada_id, comision_pct, comision_monto_fijo)
VALUES
  ('90111111-1111-4111-8111-111111111111', '90444444-4444-4444-8444-444444444402', '90222222-2222-4222-8222-222222222221', 45, 0),
  ('90111111-1111-4111-8111-111111111111', '90444444-4444-4444-8444-444444444407', '90222222-2222-4222-8222-222222222224', 42, 1800),
  ('90111111-1111-4111-8111-111111111111', '90444444-4444-4444-8444-444444444405', '90222222-2222-4222-8222-222222222223', 40, 0);

INSERT INTO producto_empleada_comisiones (usuario_id, producto_id, empleada_id, comision_pct, comision_monto_fijo)
VALUES
  ('90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555502', '90222222-2222-4222-8222-222222222222', 18, 0),
  ('90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555503', '90222222-2222-4222-8222-222222222224', 20, 0),
  ('90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555504', '90222222-2222-4222-8222-222222222221', 12, 0);

INSERT INTO turno_grupos (id, usuario_id, cliente_id, fecha_inicio, created_at, updated_at)
VALUES
  ('90777777-7777-4777-8777-777777777701', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333307', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '11 hours', NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days'),
  ('90777777-7777-4777-8777-777777777702', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333308', date_trunc('day', NOW() + INTERVAL '4 days') + INTERVAL '10 hours', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

-- ============================================
-- TURNOS (historial + semana actual + futuros)
-- ============================================

INSERT INTO turnos (
  id, usuario_id, cliente_id, grupo_id,
  servicio_id, servicio_final_id,
  empleada_id, empleada_final_id,
  empleada_final_nombre, empleada_final_apellido,
  fecha_inicio, fecha_fin, duracion_minutos,
  estado, asistio, observaciones,
  servicios_agregados, productos_agregados,
  confirmacion_estado, confirmado_en,
  iniciado_en, iniciado_por, finalizado_en, cerrado_por,
  minutos_tarde,
  creado_por, creado_por_username, created_at, updated_at
)
VALUES
  ('90888888-8888-4888-8888-888888888801', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333301', NULL, '90444444-4444-4444-8444-444444444401', '90444444-4444-4444-8444-444444444401', '90222222-2222-4222-8222-222222222221', '90222222-2222-4222-8222-222222222221', 'Paula', 'Rivas', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '10 hours', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '10 hours 45 minutes', 45, 'completado', true, 'Primera visita registrada', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '9 hours', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '10 hours 5 minutes', '90111111-1111-4111-8111-111111111112', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '10 hours 46 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '14 months 2 days', NOW() - INTERVAL '14 months'),
  ('90888888-8888-4888-8888-888888888802', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333302', NULL, '90444444-4444-4444-8444-444444444403', '90444444-4444-4444-8444-444444444403', '90222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', 'Melina', 'Soto', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '11 hours', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '12 hours', 60, 'completado', true, NULL, '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '9 hours', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '11 hours 2 minutes', '90111111-1111-4111-8111-111111111112', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '12 hours 1 minute', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '12 months 1 day', NOW() - INTERVAL '12 months'),
  ('90888888-8888-4888-8888-888888888803', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333303', NULL, '90444444-4444-4444-8444-444444444405', '90444444-4444-4444-8444-444444444405', '90222222-2222-4222-8222-222222222223', '90222222-2222-4222-8222-222222222223', 'Abril', 'Diaz', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '17 hours', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '17 hours 50 minutes', 50, 'completado', true, 'Solicito presion suave', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '15 hours', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '17 hours 1 minute', '90111111-1111-4111-8111-111111111112', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '17 hours 49 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '9 months 1 day', NOW() - INTERVAL '9 months'),
  ('90888888-8888-4888-8888-888888888804', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333304', NULL, '90444444-4444-4444-8444-444444444407', '90444444-4444-4444-8444-444444444407', '90222222-2222-4222-8222-222222222224', '90222222-2222-4222-8222-222222222224', 'Julieta', 'Mena', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '15 hours', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '16 hours 10 minutes', 70, 'completado', true, NULL, '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '12 hours', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '15 hours 2 minutes', '90111111-1111-4111-8111-111111111115', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '16 hours 8 minutes', '90111111-1111-4111-8111-111111111115', 0, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '6 months 2 days', NOW() - INTERVAL '6 months'),
  ('90888888-8888-4888-8888-888888888805', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333305', NULL, '90444444-4444-4444-8444-444444444402', '90444444-4444-4444-8444-444444444402', '90222222-2222-4222-8222-222222222221', '90222222-2222-4222-8222-222222222221', 'Paula', 'Rivas', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '12 hours', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '13 hours 15 minutes', 75, 'completado', true, NULL, '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '10 hours', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '12 hours 1 minute', '90111111-1111-4111-8111-111111111114', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '13 hours 12 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '41 days', NOW() - INTERVAL '40 days'),
  ('90888888-8888-4888-8888-888888888806', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333306', NULL, '90444444-4444-4444-8444-444444444404', '90444444-4444-4444-8444-444444444404', '90222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', 'Melina', 'Soto', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '13 hours', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '14 hours 20 minutes', 80, 'completado', true, NULL, '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '10 hours', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '13 hours 2 minutes', '90111111-1111-4111-8111-111111111112', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '14 hours 18 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '11 days', NOW() - INTERVAL '10 days'),
  ('90888888-8888-4888-8888-888888888807', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333301', NULL, '90444444-4444-4444-8444-444444444402', '90444444-4444-4444-8444-444444444402', '90222222-2222-4222-8222-222222222221', '90222222-2222-4222-8222-222222222221', 'Paula', 'Rivas', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '11 hours', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '12 hours 15 minutes', 75, 'completado', true, 'Sumo nail art premium', '[{"servicio_id":"90444444-4444-4444-8444-444444444408","nombre":"Nail art premium","precio":12000}]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '9 hours', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '11 hours 1 minute', '90111111-1111-4111-8111-111111111114', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '12 hours 13 minutes', '90111111-1111-4111-8111-111111111112', 1, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
  ('90888888-8888-4888-8888-888888888808', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333302', NULL, '90444444-4444-4444-8444-444444444404', '90444444-4444-4444-8444-444444444404', '90222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', 'Melina', 'Soto', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '13 hours', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '14 hours 20 minutes', 80, 'completado', true, 'Se aplico sena previa', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '10 hours', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '13 hours 2 minutes', '90111111-1111-4111-8111-111111111112', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '14 hours 18 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
  ('90888888-8888-4888-8888-888888888809', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333303', NULL, '90444444-4444-4444-8444-444444444407', '90444444-4444-4444-8444-444444444407', '90222222-2222-4222-8222-222222222224', '90222222-2222-4222-8222-222222222224', 'Julieta', 'Mena', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '16 hours', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '17 hours 10 minutes', 70, 'completado', true, 'Se pago con giftcard', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '12 hours', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '16 hours 1 minute', '90111111-1111-4111-8111-111111111115', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '17 hours 8 minutes', '90111111-1111-4111-8111-111111111115', 0, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
  ('90888888-8888-4888-8888-88888888880a', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333304', NULL, '90444444-4444-4444-8444-444444444401', '90444444-4444-4444-8444-444444444401', '90222222-2222-4222-8222-222222222221', '90222222-2222-4222-8222-222222222221', 'Paula', 'Rivas', NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '15 minutes', 45, 'en_curso', true, NULL, '[]'::jsonb, '[]'::jsonb, 'confirmado', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 minutes', '90111111-1111-4111-8111-111111111114', NULL, NULL, 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '1 day', NOW()),
  ('90888888-8888-4888-8888-88888888880b', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333305', NULL, '90444444-4444-4444-8444-444444444406', '90444444-4444-4444-8444-444444444406', '90222222-2222-4222-8222-222222222223', '90222222-2222-4222-8222-222222222223', 'Abril', 'Diaz', date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '18 hours', date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '19 hours', 60, 'pendiente', NULL, 'Pendiente de confirmacion final', '[]'::jsonb, '[]'::jsonb, 'enviada', NULL, NULL, NULL, NULL, NULL, 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours'),
  ('90888888-8888-4888-8888-88888888880c', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333306', NULL, '90444444-4444-4444-8444-444444444405', '90444444-4444-4444-8444-444444444405', '90222222-2222-4222-8222-222222222223', '90222222-2222-4222-8222-222222222223', 'Abril', 'Diaz', date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '19 hours', date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '19 hours 50 minutes', 50, 'cancelado', false, 'Cancelo con poca anticipacion', '[]'::jsonb, '[]'::jsonb, 'no_confirmado', NULL, NULL, NULL, NULL, NULL, 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours'),
  ('90888888-8888-4888-8888-88888888880d', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333307', '90777777-7777-4777-8777-777777777701', '90444444-4444-4444-8444-444444444402', '90444444-4444-4444-8444-444444444402', '90222222-2222-4222-8222-222222222221', '90222222-2222-4222-8222-222222222221', 'Paula', 'Rivas', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '11 hours', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '12 hours 15 minutes', 75, 'completado', true, 'Simultaneo 1/2', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '9 hours', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '11 hours 1 minute', '90111111-1111-4111-8111-111111111114', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '12 hours 12 minutes', '90111111-1111-4111-8111-111111111112', 0, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '56 days', NOW() - INTERVAL '55 days'),
  ('90888888-8888-4888-8888-88888888880e', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333307', '90777777-7777-4777-8777-777777777701', '90444444-4444-4444-8444-444444444407', '90444444-4444-4444-8444-444444444407', '90222222-2222-4222-8222-222222222224', '90222222-2222-4222-8222-222222222224', 'Julieta', 'Mena', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '11 hours', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '12 hours 10 minutes', 70, 'completado', true, 'Simultaneo 2/2', '[]'::jsonb, '[]'::jsonb, 'confirmado', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '9 hours', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '11 hours 1 minute', '90111111-1111-4111-8111-111111111115', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '12 hours 8 minutes', '90111111-1111-4111-8111-111111111115', 0, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '56 days', NOW() - INTERVAL '55 days'),
  ('90888888-8888-4888-8888-88888888880f', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333308', '90777777-7777-4777-8777-777777777702', '90444444-4444-4444-8444-444444444401', '90444444-4444-4444-8444-444444444401', '90222222-2222-4222-8222-222222222225', '90222222-2222-4222-8222-222222222225', 'Lucia', 'Ferrer', date_trunc('day', NOW() + INTERVAL '4 days') + INTERVAL '10 hours', date_trunc('day', NOW() + INTERVAL '4 days') + INTERVAL '10 hours 45 minutes', 45, 'pendiente', NULL, 'Simultaneo futuro 1/2', '[]'::jsonb, '[]'::jsonb, 'no_enviada', NULL, NULL, NULL, NULL, NULL, 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
  ('90888888-8888-4888-8888-888888888810', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333308', '90777777-7777-4777-8777-777777777702', '90444444-4444-4444-8444-444444444403', '90444444-4444-4444-8444-444444444403', '90222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', 'Melina', 'Soto', date_trunc('day', NOW() + INTERVAL '4 days') + INTERVAL '10 hours', date_trunc('day', NOW() + INTERVAL '4 days') + INTERVAL '11 hours', 60, 'pendiente', NULL, 'Simultaneo futuro 2/2', '[]'::jsonb, '[]'::jsonb, 'no_enviada', NULL, NULL, NULL, NULL, NULL, 0, '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours');

INSERT INTO turno_servicios (id, turno_id, servicio_id, usuario_id, es_original, agregado_por, agregado_por_rol, precio_unitario, cantidad, created_at)
VALUES
  ('90999999-9999-4999-8999-999999999901', '90888888-8888-4888-8888-888888888805', '90444444-4444-4444-8444-444444444402', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111111', 'admin', 32000, 1, NOW() - INTERVAL '40 days'),
  ('90999999-9999-4999-8999-999999999902', '90888888-8888-4888-8888-888888888807', '90444444-4444-4444-8444-444444444402', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111112', 'recepcion', 32000, 1, NOW() - INTERVAL '3 days'),
  ('90999999-9999-4999-8999-999999999903', '90888888-8888-4888-8888-888888888807', '90444444-4444-4444-8444-444444444408', '90111111-1111-4111-8111-111111111111', false, '90111111-1111-4111-8111-111111111114', 'staff', 12000, 1, NOW() - INTERVAL '3 days'),
  ('90999999-9999-4999-8999-999999999904', '90888888-8888-4888-8888-888888888808', '90444444-4444-4444-8444-444444444404', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111112', 'recepcion', 34000, 1, NOW() - INTERVAL '2 days'),
  ('90999999-9999-4999-8999-999999999905', '90888888-8888-4888-8888-888888888809', '90444444-4444-4444-8444-444444444407', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111111', 'admin', 30000, 1, NOW() - INTERVAL '1 day'),
  ('90999999-9999-4999-8999-999999999906', '90888888-8888-4888-8888-88888888880d', '90444444-4444-4444-8444-444444444402', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111111', 'admin', 32000, 1, NOW() - INTERVAL '55 days'),
  ('90999999-9999-4999-8999-999999999907', '90888888-8888-4888-8888-88888888880e', '90444444-4444-4444-8444-444444444407', '90111111-1111-4111-8111-111111111111', true, '90111111-1111-4111-8111-111111111111', 'admin', 30000, 1, NOW() - INTERVAL '55 days');

-- ============================================
-- SENAS Y GIFTCARDS
-- ============================================

INSERT INTO senas (
  id, usuario_id, cliente_id, servicio_id, turno_id,
  monto, metodo_pago, estado, nota, fecha_pago,
  aplicada_en, aplicada_por, creado_por_username, created_at, updated_at
)
VALUES
  ('90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333302', '90444444-4444-4444-8444-444444444404', '90888888-8888-4888-8888-888888888808', 12000, 'transferencia', 'aplicada', 'Sena tomada al reservar pedicuria completa', NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days', '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days'),
  ('90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333305', '90444444-4444-4444-8444-444444444406', '90888888-8888-4888-8888-88888888880b', 15000, 'efectivo', 'pendiente', 'Sena para masaje de la semana proxima', NOW() - INTERVAL '1 day', NULL, NULL, 'demo_recepcion_estetica', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', '90111111-1111-4111-8111-111111111111', '90333333-3333-4333-8333-333333333307', '90444444-4444-4444-8444-444444444402', NULL, 10000, 'tarjeta', 'aplicada', 'Sena aplicada en cierre grupal', NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days', '90111111-1111-4111-8111-111111111112', 'demo_recepcion_estetica', NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days');

INSERT INTO giftcards (
  id, usuario_id, numero, cliente_id, servicio_ids, valido_por_dias, valido_hasta,
  de_parte_de, monto_total, metodo_pago, facturado, estado, usada_en, usada_en_turno_id,
  imagen_base64, creado_por, creado_por_username, created_at, updated_at
)
VALUES
  ('90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', '90111111-1111-4111-8111-111111111111', 'GC-2602-001', '90333333-3333-4333-8333-333333333308', '["90444444-4444-4444-8444-444444444401","90444444-4444-4444-8444-444444444407"]'::jsonb, 120, NOW() + INTERVAL '90 days', 'Familia Suarez', 47000, 'transferencia', true, 'vigente', NULL, NULL, NULL, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
  ('90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', '90111111-1111-4111-8111-111111111111', 'GC-2510-014', '90333333-3333-4333-8333-333333333303', '["90444444-4444-4444-8444-444444444407"]'::jsonb, 120, NOW() + INTERVAL '30 days', 'Amigas de Sofia', 30000, 'efectivo', true, 'usada', NOW() - INTERVAL '1 day', '90888888-8888-4888-8888-888888888809', NULL, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '130 days', NOW() - INTERVAL '1 day'),
  ('90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', '90111111-1111-4111-8111-111111111111', 'GC-2504-007', '90333333-3333-4333-8333-333333333306', '["90444444-4444-4444-8444-444444444405"]'::jsonb, 90, NOW() - INTERVAL '200 days', 'Promo aniversario', 24000, 'tarjeta', false, 'anulada', NULL, NULL, NULL, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '320 days', NOW() - INTERVAL '180 days');

-- ============================================
-- PAGOS Y LIQUIDACIONES
-- ============================================

INSERT INTO pagos (
  id, usuario_id, turno_id, monto, metodo_pago, estado, fecha_pago,
  sena_aplicada_id, monto_sena_aplicada,
  giftcard_aplicada_id, monto_giftcard_aplicado,
  creado_por_username, created_at
)
VALUES
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc01', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888801', 18000, 'efectivo', 'completado', date_trunc('day', NOW() - INTERVAL '14 months') + INTERVAL '10 hours 50 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '14 months'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc02', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888802', 26000, 'transferencia', 'completado', date_trunc('day', NOW() - INTERVAL '12 months') + INTERVAL '12 hours 5 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '12 months'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc03', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888803', 28000, 'tarjeta', 'completado', date_trunc('day', NOW() - INTERVAL '9 months') + INTERVAL '17 hours 55 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '9 months'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc04', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888804', 30000, 'tarjeta', 'completado', date_trunc('day', NOW() - INTERVAL '6 months') + INTERVAL '16 hours 15 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '6 months'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc05', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888805', 32000, 'tarjeta', 'completado', date_trunc('day', NOW() - INTERVAL '40 days') + INTERVAL '13 hours 20 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '40 days'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc06', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888806', 34000, 'efectivo', 'completado', date_trunc('day', NOW() - INTERVAL '10 days') + INTERVAL '14 hours 25 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '10 days'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc07', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888807', 44000, 'tarjeta', 'completado', date_trunc('day', NOW() - INTERVAL '3 days') + INTERVAL '12 hours 20 minutes', NULL, 0, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '3 days'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc08', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888808', 22000, 'transferencia', 'completado', date_trunc('day', NOW() - INTERVAL '2 days') + INTERVAL '14 hours 25 minutes', '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 12000, NULL, 0, 'demo_caja_estetica', NOW() - INTERVAL '2 days'),
  ('90cccccc-cccc-4ccc-8ccc-cccccccccc09', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-888888888809', 30000, 'giftcard', 'completado', date_trunc('day', NOW() - INTERVAL '1 day') + INTERVAL '17 hours 15 minutes', NULL, 0, '90bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 30000, 'demo_caja_estetica', NOW() - INTERVAL '1 day');

INSERT INTO pagos_grupos (
  id, usuario_id, turno_grupo_id, cliente_id, monto, metodo_pago, estado, fecha_pago,
  sena_aplicada_id, monto_sena_aplicada, giftcard_aplicada_id, monto_giftcard_aplicado,
  penalidad_monto, observaciones, creado_por_username, created_at
)
VALUES
  ('90dddddd-dddd-4ddd-8ddd-dddddddddd01', '90111111-1111-4111-8111-111111111111', '90777777-7777-4777-8777-777777777701', '90333333-3333-4333-8333-333333333307', 52000, 'transferencia', 'completado', date_trunc('day', NOW() - INTERVAL '55 days') + INTERVAL '12 hours 20 minutes', '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', 10000, NULL, 0, NULL, 'Cierre de simultaneos con sena', 'demo_caja_estetica', NOW() - INTERVAL '55 days');

INSERT INTO pago_grupo_items (id, usuario_id, pago_grupo_id, turno_id, monto, created_at)
VALUES
  ('90eeeeee-eeee-4eee-8eee-eeeeeeeeee01', '90111111-1111-4111-8111-111111111111', '90dddddd-dddd-4ddd-8ddd-dddddddddd01', '90888888-8888-4888-8888-88888888880d', 30000, NOW() - INTERVAL '55 days'),
  ('90eeeeee-eeee-4eee-8eee-eeeeeeeeee02', '90111111-1111-4111-8111-111111111111', '90dddddd-dddd-4ddd-8ddd-dddddddddd01', '90888888-8888-4888-8888-88888888880e', 22000, NOW() - INTERVAL '55 days');

INSERT INTO adelantos (id, usuario_id, empleada_id, monto, motivo, fecha_entrega, creado_por_username, created_at)
VALUES
  ('90ffffff-ffff-4fff-8fff-fffffffff001', '90111111-1111-4111-8111-111111111111', '90222222-2222-4222-8222-222222222221', 40000, 'Adelanto mitad de mes', NOW() - INTERVAL '60 days', 'demo_admin_estetica', NOW() - INTERVAL '60 days'),
  ('90ffffff-ffff-4fff-8fff-fffffffff002', '90111111-1111-4111-8111-111111111111', '90222222-2222-4222-8222-222222222222', 28000, 'Adelanto por gastos medicos', NOW() - INTERVAL '20 days', 'demo_admin_estetica', NOW() - INTERVAL '20 days'),
  ('90ffffff-ffff-4fff-8fff-fffffffff003', '90111111-1111-4111-8111-111111111111', '90222222-2222-4222-8222-222222222224', 25000, 'Adelanto semana actual', NOW() - INTERVAL '2 days', 'demo_admin_estetica', NOW() - INTERVAL '2 days');

-- ============================================
-- INVENTARIO / CAJA / RECORDATORIOS
-- ============================================

INSERT INTO producto_movimientos (
  id, usuario_id, producto_id, cliente_id, empleada_id, tipo, cantidad,
  costo_unitario, precio_unitario, metodo_pago, nota,
  creado_por, creado_por_username, created_at
)
VALUES
  ('90ac0000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555501', NULL, NULL, 'compra', 35, 4500, NULL, NULL, 'Stock inicial', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '12 months'),
  ('90ac0000-0000-4000-8000-000000000002', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555502', NULL, NULL, 'compra', 25, 5300, NULL, NULL, 'Stock inicial', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '11 months'),
  ('90ac0000-0000-4000-8000-000000000003', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555503', NULL, NULL, 'compra', 20, 7000, NULL, NULL, 'Stock inicial', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '9 months'),
  ('90ac0000-0000-4000-8000-000000000004', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555504', NULL, NULL, 'compra', 40, 2500, NULL, NULL, 'Reposicion trimestral', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '8 months'),
  ('90ac0000-0000-4000-8000-000000000005', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555501', '90333333-3333-4333-8333-333333333301', '90222222-2222-4222-8222-222222222221', 'venta', 2, NULL, 9800, 'tarjeta', 'Venta post servicio de unas', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '20 days'),
  ('90ac0000-0000-4000-8000-000000000006', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555503', '90333333-3333-4333-8333-333333333303', '90222222-2222-4222-8222-222222222224', 'venta', 1, NULL, 16500, 'transferencia', 'Recomendado luego de lifting', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '9 days'),
  ('90ac0000-0000-4000-8000-000000000007', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555502', '90333333-3333-4333-8333-333333333307', '90222222-2222-4222-8222-222222222222', 'venta', 1, NULL, 14200, 'efectivo', 'Venta durante cierre grupal', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '5 days'),
  ('90ac0000-0000-4000-8000-000000000008', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555504', '90333333-3333-4333-8333-333333333301', '90222222-2222-4222-8222-222222222221', 'venta', 3, NULL, 6200, 'tarjeta', 'Color de mantenimiento', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '3 days'),
  ('90ac0000-0000-4000-8000-000000000009', '90111111-1111-4111-8111-111111111111', '90555555-5555-4555-8555-555555555505', '90333333-3333-4333-8333-333333333302', '90222222-2222-4222-8222-222222222225', 'venta', 1, NULL, 7900, 'efectivo', 'Venta post pedicuria', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '1 day');

INSERT INTO insumo_movimientos (id, usuario_id, insumo_id, empleado_id, tipo, cantidad, nota, creado_por, creado_por_username, created_at)
VALUES
  ('90b10000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', '90666666-6666-4666-8666-666666666601', NULL, 'compra', 300, 'Compra mensual de guantes', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '9 months'),
  ('90b10000-0000-4000-8000-000000000002', '90111111-1111-4111-8111-111111111111', '90666666-6666-4666-8666-666666666602', NULL, 'compra', 400, 'Compra mayorista de limas', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '9 months'),
  ('90b10000-0000-4000-8000-000000000003', '90111111-1111-4111-8111-111111111111', '90666666-6666-4666-8666-666666666603', NULL, 'compra', 500, 'Compra trimestral toallas', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '8 months'),
  ('90b10000-0000-4000-8000-000000000004', '90111111-1111-4111-8111-111111111111', '90666666-6666-4666-8666-666666666602', '90222222-2222-4222-8222-222222222221', 'entrega', 35, 'Entrega semanal cabina manos', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '5 days');

INSERT INTO caja_movimientos (id, usuario_id, medio_pago, tipo, monto, motivo, source_tipo, source_id, creado_por, creado_por_username, created_at)
VALUES
  ('90cc0000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', 'efectivo', 'ingreso', 150000, 'Fondo inicial de caja demo', 'manual', NULL, '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '14 months'),
  ('90cc0000-0000-4000-8000-000000000002', '90111111-1111-4111-8111-111111111111', 'transferencia', 'ingreso', 12000, 'Registro de sena aplicada', 'sena_registro', '90aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '7 days'),
  ('90cc0000-0000-4000-8000-000000000003', '90111111-1111-4111-8111-111111111111', 'tarjeta', 'ingreso', 44000, 'Cierre turno con servicios extra', 'turno_pago', '90cccccc-cccc-4ccc-8ccc-cccccccccc07', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '3 days'),
  ('90cc0000-0000-4000-8000-000000000004', '90111111-1111-4111-8111-111111111111', 'transferencia', 'ingreso', 52000, 'Cobro grupo simultaneo con sena', 'turno_grupo_pago', '90dddddd-dddd-4ddd-8ddd-dddddddddd01', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '55 days'),
  ('90cc0000-0000-4000-8000-000000000005', '90111111-1111-4111-8111-111111111111', 'efectivo', 'egreso', 25000, 'Pago adelanto Julieta Mena', 'adelanto', '90ffffff-ffff-4fff-8fff-fffffffff003', '90111111-1111-4111-8111-111111111111', 'demo_admin_estetica', NOW() - INTERVAL '2 days'),
  ('90cc0000-0000-4000-8000-000000000006', '90111111-1111-4111-8111-111111111111', 'efectivo', 'ingreso', 7900, 'Venta de producto hidratacion', 'producto_venta', '90ac0000-0000-4000-8000-000000000009', '90111111-1111-4111-8111-111111111113', 'demo_caja_estetica', NOW() - INTERVAL '1 day');

INSERT INTO empleada_ausencias (id, usuario_id, empleada_id, fecha_desde, fecha_hasta, hora_desde, hora_hasta, motivo, descripcion, created_at, updated_at)
VALUES
  ('90ca0000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', '90222222-2222-4222-8222-222222222225', CURRENT_DATE + 10, CURRENT_DATE + 14, NULL, NULL, 'vacaciones', 'Vacaciones programadas.', NOW(), NOW());

INSERT INTO recordatorios (id, usuario_id, turno_id, cliente_telefono, estado, created_at)
VALUES
  ('90ce0000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-88888888880b', '1150010005', 'pendiente', NOW() - INTERVAL '2 hours'),
  ('90ce0000-0000-4000-8000-000000000002', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-88888888880f', '1150010008', 'pendiente', NOW() - INTERVAL '1 hour');

INSERT INTO confirmation_tokens (id, usuario_id, turno_id, token, expires_at, confirmed_at, created_at)
VALUES
  ('90cd0000-0000-4000-8000-000000000001', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-88888888880b', 'demo-token-turno-80b', NOW() + INTERVAL '2 days', NULL, NOW() - INTERVAL '2 hours'),
  ('90cd0000-0000-4000-8000-000000000002', '90111111-1111-4111-8111-111111111111', '90888888-8888-4888-8888-88888888880f', 'demo-token-turno-80f', NOW() + INTERVAL '5 days', NULL, NOW() - INTERVAL '1 hour');

COMMIT;

