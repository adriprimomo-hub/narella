-- ============================================
-- SEED DATA - Sistema Narella Turnos
-- ============================================
-- Datos de ejemplo para desarrollo y testing
-- ============================================

-- Limpiar datos existentes (cuidado en producción!)
-- TRUNCATE TABLE usuarios CASCADE;

-- ============================================
-- USUARIOS
-- ============================================
-- Password: "admin" hasheado con bcrypt (rounds=10)
-- Hash generado con: bcrypt.hashSync("admin", 10)

INSERT INTO usuarios (id, username, password_hash, rol, tenant_id)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "admin"
    'admin',
    'a0000000-0000-0000-0000-000000000001' -- self-reference
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'recepcion',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "admin"
    'recepcion',
    'a0000000-0000-0000-0000-000000000001'
  );

-- Configuración global del local
INSERT INTO configuracion (id, usuario_id, horario_local, nombre_local)
VALUES
  (
    'f0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '[
      {"dia": 0, "desde": "", "hasta": "", "activo": false},
      {"dia": 1, "desde": "09:00", "hasta": "19:00", "activo": true},
      {"dia": 2, "desde": "09:00", "hasta": "19:00", "activo": true},
      {"dia": 3, "desde": "09:00", "hasta": "19:00", "activo": true},
      {"dia": 4, "desde": "09:00", "hasta": "19:00", "activo": true},
      {"dia": 5, "desde": "09:00", "hasta": "19:00", "activo": true},
      {"dia": 6, "desde": "10:00", "hasta": "14:00", "activo": true}
    ]'::jsonb,
    'Narella'
  );

-- ============================================
-- CLIENTES
-- ============================================

INSERT INTO clientes (id, usuario_id, nombre, apellido, telefono, observaciones)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Sofia', 'Perez', '1112345678', 'Prefiere horario temprano'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Lucia', 'Gomez', '1198765432', NULL),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Martina', 'Rodriguez', '1145678901', 'Alergia a ciertos productos'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Valentina', 'Martinez', '1156789012', NULL),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Camila', 'Fernandez', '1167890123', 'Cliente VIP');

-- ============================================
-- EMPLEADAS
-- ============================================

INSERT INTO empleadas (id, usuario_id, nombre, apellido, telefono, activo, horarios)
VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Ana Maria',
    'Lopez',
    '1122334455',
    true,
    '[
      {"dia": 1, "desde": "09:00", "hasta": "17:00"},
      {"dia": 2, "desde": "09:00", "hasta": "17:00"},
      {"dia": 3, "desde": "09:00", "hasta": "17:00"},
      {"dia": 4, "desde": "09:00", "hasta": "17:00"},
      {"dia": 5, "desde": "09:00", "hasta": "17:00"}
    ]'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Belen Soledad',
    'Gomez',
    '1100112233',
    true,
    '[
      {"dia": 2, "desde": "10:00", "hasta": "18:00"},
      {"dia": 3, "desde": "10:00", "hasta": "18:00"},
      {"dia": 4, "desde": "10:00", "hasta": "18:00"},
      {"dia": 5, "desde": "10:00", "hasta": "18:00"},
      {"dia": 6, "desde": "10:00", "hasta": "14:00"}
    ]'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Carolina',
    'Diaz',
    '1144556677',
    true,
    '[
      {"dia": 1, "desde": "13:00", "hasta": "19:00"},
      {"dia": 3, "desde": "13:00", "hasta": "19:00"},
      {"dia": 5, "desde": "13:00", "hasta": "19:00"},
      {"dia": 6, "desde": "10:00", "hasta": "14:00"}
    ]'::jsonb
  );

-- ============================================
-- SERVICIOS
-- ============================================

INSERT INTO servicios (
  id, usuario_id, nombre, precio, precio_lista, precio_descuento, duracion_minutos, activo, categoria, comision_pct
)
VALUES
  (
    's0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Corte y styling',
    1200.00,
    1200.00,
    1100.00,
    60,
    true,
    'principal',
    40.00
  ),
  (
    's0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Color completo',
    3200.00,
    3200.00,
    3000.00,
    90,
    true,
    'principal',
    45.00
  ),
  (
    's0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Mechas californianas',
    2800.00,
    2800.00,
    2600.00,
    120,
    true,
    'principal',
    45.00
  ),
  (
    's0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Tratamiento de keratina',
    4500.00,
    4500.00,
    4200.00,
    150,
    true,
    'principal',
    50.00
  ),
  (
    's0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Peinado social',
    1800.00,
    1800.00,
    1650.00,
    45,
    true,
    'principal',
    40.00
  ),
  (
    's0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000001',
    'Extra diseño',
    500.00,
    500.00,
    450.00,
    15,
    true,
    'adicional',
    40.00
  ),
  (
    's0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000001',
    'Alisado express',
    2000.00,
    2000.00,
    1850.00,
    90,
    true,
    'principal',
    45.00
  );

-- ============================================
-- TURNOS (Ejemplos variados)
-- ============================================

-- Turno completado (ayer)
INSERT INTO turnos (
  id, usuario_id, cliente_id, servicio_id, servicio_final_id,
  empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
  duracion_minutos, estado, asistio, confirmacion_estado,
  creado_por, creado_por_username
)
VALUES (
  't0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  's0000000-0000-0000-0000-000000000001',
  's0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  NOW() - INTERVAL '1 day' + INTERVAL '10 hours',
  NOW() - INTERVAL '1 day' + INTERVAL '11 hours',
  60,
  'completado',
  true,
  'confirmado',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Turno de hoy - en curso
INSERT INTO turnos (
  id, usuario_id, cliente_id, servicio_id, servicio_final_id,
  empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
  duracion_minutos, estado, asistio, confirmacion_estado,
  iniciado_en, iniciado_por,
  creado_por, creado_por_username
)
VALUES (
  't0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  's0000000-0000-0000-0000-000000000002',
  's0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '30 minutes',
  NOW() + INTERVAL '60 minutes',
  90,
  'en_curso',
  true,
  'confirmado',
  NOW() - INTERVAL '30 minutes',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'recepcion'
);

-- Turno de hoy - pendiente (tarde)
INSERT INTO turnos (
  id, usuario_id, cliente_id, servicio_id, servicio_final_id,
  empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
  duracion_minutos, estado, confirmacion_estado,
  creado_por, creado_por_username, observaciones
)
VALUES (
  't0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  's0000000-0000-0000-0000-000000000003',
  's0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '3 hours',
  NOW() + INTERVAL '5 hours',
  120,
  'pendiente',
  'confirmado',
  'a0000000-0000-0000-0000-000000000001',
  'admin',
  'Quiere mechas muy claras'
);

-- Turno mañana - pendiente sin confirmar
INSERT INTO turnos (
  id, usuario_id, cliente_id, servicio_id, servicio_final_id,
  empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
  duracion_minutos, estado, confirmacion_estado,
  creado_por, creado_por_username
)
VALUES (
  't0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000004',
  's0000000-0000-0000-0000-000000000001',
  's0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000003',
  NOW() + INTERVAL '1 day' + INTERVAL '14 hours',
  NOW() + INTERVAL '1 day' + INTERVAL '15 hours',
  60,
  'pendiente',
  'enviada',
  'a0000000-0000-0000-0000-000000000002',
  'recepcion'
);

-- Turno cancelado
INSERT INTO turnos (
  id, usuario_id, cliente_id, servicio_id, servicio_final_id,
  empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
  duracion_minutos, estado, confirmacion_estado,
  creado_por, creado_por_username, observaciones
)
VALUES (
  't0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  's0000000-0000-0000-0000-000000000004',
  's0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000002',
  NOW() + INTERVAL '2 days' + INTERVAL '11 hours',
  NOW() + INTERVAL '2 days' + INTERVAL '13 hours 30 minutes',
  150,
  'cancelado',
  'no_enviada',
  'a0000000-0000-0000-0000-000000000001',
  'admin',
  'Cliente canceló por motivos personales'
);

-- ============================================
-- SEÑA
-- ============================================

-- Seña aplicada
INSERT INTO senas (
  id, usuario_id, cliente_id, turno_id, monto, metodo_pago,
  estado, nota, fecha_pago, aplicada_en, aplicada_por, creado_por_username
)
VALUES (
  'sn000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  't0000000-0000-0000-0000-000000000001',
  500.00,
  'efectivo',
  'aplicada',
  'Seña para color',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Seña pendiente
INSERT INTO senas (
  id, usuario_id, cliente_id, monto, metodo_pago,
  estado, nota, fecha_pago, creado_por_username
)
VALUES (
  'sn000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000003',
  800.00,
  'transferencia',
  'pendiente',
  'Para tratamiento de keratina próxima semana',
  NOW() - INTERVAL '1 day',
  'recepcion'
);

-- ============================================
-- PAGOS
-- ============================================

-- Pago del turno completado con seña aplicada
INSERT INTO pagos (
  id, usuario_id, turno_id, monto, metodo_pago, estado,
  fecha_pago, sena_aplicada_id, monto_sena_aplicada, creado_por_username
)
VALUES (
  'p0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  't0000000-0000-0000-0000-000000000001',
  700.00, -- 1200 - 500 (seña)
  'efectivo',
  'completado',
  NOW() - INTERVAL '1 day' + INTERVAL '11 hours',
  'sn000000-0000-0000-0000-000000000001',
  500.00,
  'admin'
);

-- ============================================
-- ADELANTOS
-- ============================================

INSERT INTO adelantos (
  id, usuario_id, empleada_id, monto, motivo,
  fecha_entrega, creado_por_username
)
VALUES (
  'adl00000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  5000.00,
  'Adelanto quincena',
  NOW() - INTERVAL '5 days',
  'admin'
);

-- ============================================
-- PRODUCTOS
-- ============================================

INSERT INTO productos (
  id, usuario_id, nombre, descripcion, stock_actual, stock_minimo,
  precio_lista, precio_descuento, activo, creado_por_username
)
VALUES
  (
    'pr000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Shampoo brillo profesional',
    'Shampoo para cabello teñido',
    12,
    5,
    1500.00,
    1400.00,
    true,
    'admin'
  ),
  (
    'pr000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Acondicionador reparador',
    'Acondicionador para cabello dañado',
    8,
    5,
    1800.00,
    1650.00,
    true,
    'admin'
  ),
  (
    'pr000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Ampolla de keratina',
    'Tratamiento intensivo',
    3, -- stock bajo!
    5,
    2500.00,
    2300.00,
    true,
    'admin'
  );

-- ============================================
-- INSUMOS
-- ============================================

INSERT INTO insumos (
  id, usuario_id, nombre, stock_actual, stock_minimo,
  activo, creado_por_username
)
VALUES
  (
    'in000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Guantes descartables',
    50.00,
    20.00,
    true,
    'admin'
  ),
  (
    'in000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Papel aluminio profesional',
    2.00,
    3.00,
    true,
    'admin'
  ),
  (
    'in000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Oxigenada 30 vol',
    5.50,
    2.00,
    true,
    'admin'
  );

-- ============================================
-- MOVIMIENTOS DE PRODUCTOS
-- ============================================

-- Compra inicial
INSERT INTO producto_movimientos (
  id, usuario_id, producto_id, tipo, cantidad, costo_unitario,
  precio_unitario, nota, creado_por, creado_por_username
)
VALUES (
  'pm000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'pr000000-0000-0000-0000-000000000001',
  'compra',
  15,
  800.00,
  1500.00,
  'Stock inicial',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Venta a cliente
INSERT INTO producto_movimientos (
  id, usuario_id, producto_id, cliente_id, tipo, cantidad,
  precio_unitario, metodo_pago, creado_por, creado_por_username
)
VALUES (
  'pm000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'pr000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'venta',
  3,
  1500.00,
  'efectivo',
  'a0000000-0000-0000-0000-000000000002',
  'recepcion'
);

-- ============================================
-- MOVIMIENTOS DE CAJA
-- ============================================

-- Caja inicial
INSERT INTO caja_movimientos (
  id, usuario_id, medio_pago, tipo, monto, motivo,
  source_tipo, creado_por, creado_por_username
)
VALUES (
  'cm000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'efectivo',
  'ingreso',
  5000.00,
  'Caja inicial del día',
  'manual',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Ingreso por pago de turno
INSERT INTO caja_movimientos (
  id, usuario_id, medio_pago, tipo, monto, motivo,
  source_tipo, source_id, creado_por, creado_por_username
)
VALUES (
  'cm000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'efectivo',
  'ingreso',
  700.00,
  'Pago turno - Sofia Perez',
  'turno_pago',
  'p0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Egreso por adelanto
INSERT INTO caja_movimientos (
  id, usuario_id, medio_pago, tipo, monto, motivo,
  source_tipo, source_id, creado_por, creado_por_username
)
VALUES (
  'cm000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'efectivo',
  'egreso',
  5000.00,
  'Adelanto - Ana Maria',
  'adelanto',
  'adl00000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- Egreso por compra de insumos
INSERT INTO caja_movimientos (
  id, usuario_id, medio_pago, tipo, monto, motivo,
  source_tipo, creado_por, creado_por_username
)
VALUES (
  'cm000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'efectivo',
  'egreso',
  12000.00,
  'Compra de shampoo x 15 unidades',
  'producto_compra',
  'a0000000-0000-0000-0000-000000000001',
  'admin'
);

-- ============================================
-- COMISIONES ESPECIALES
-- ============================================

-- Comisión especial para Ana en Color completo (50% en vez de 45%)
INSERT INTO servicio_empleada_comisiones (
  usuario_id, servicio_id, empleada_id, comision_pct
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  's0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',
  50.00
);

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Contar registros insertados
DO $$
BEGIN
  RAISE NOTICE 'Usuarios: %', (SELECT COUNT(*) FROM usuarios);
  RAISE NOTICE 'Clientes: %', (SELECT COUNT(*) FROM clientes);
  RAISE NOTICE 'Empleadas: %', (SELECT COUNT(*) FROM empleadas);
  RAISE NOTICE 'Servicios: %', (SELECT COUNT(*) FROM servicios);
  RAISE NOTICE 'Turnos: %', (SELECT COUNT(*) FROM turnos);
  RAISE NOTICE 'Señas: %', (SELECT COUNT(*) FROM senas);
  RAISE NOTICE 'Pagos: %', (SELECT COUNT(*) FROM pagos);
  RAISE NOTICE 'Adelantos: %', (SELECT COUNT(*) FROM adelantos);
  RAISE NOTICE 'Productos: %', (SELECT COUNT(*) FROM productos);
  RAISE NOTICE 'Insumos: %', (SELECT COUNT(*) FROM insumos);
  RAISE NOTICE 'Movimientos de caja: %', (SELECT COUNT(*) FROM caja_movimientos);
  RAISE NOTICE '====================================';
  RAISE NOTICE 'SEED DATA INSERTADO EXITOSAMENTE';
END $$;
