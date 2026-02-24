-- ============================================
-- SCHEMA POSTGRESQL - Sistema de Turnos Narella
-- ============================================
-- Base de datos para gestión de turnos de salón de belleza
-- Incluye: turnos, pagos, comisiones, inventario, caja
-- ============================================

-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: usuarios
-- Gestión de usuarios del sistema
-- ============================================
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255), -- bcrypt hash
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'recepcion', 'staff', 'caja', 'solo_turnos')),
  tenant_id UUID, -- Para multi-tenancy (apunta al admin)
  empleada_id UUID, -- Relación opcional para usuarios staff

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_usuarios_tenant_id ON usuarios(tenant_id);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_empleada_id ON usuarios(empleada_id);

COMMENT ON TABLE usuarios IS 'Usuarios del sistema';
COMMENT ON COLUMN usuarios.tenant_id IS 'ID del admin owner para multi-tenancy';

-- ============================================
-- TABLA: configuracion
-- Configuración global del local/tenant
-- ============================================
CREATE TABLE configuracion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, -- el admin/tenant

  -- Horarios del local
  horario_local JSONB DEFAULT '[]'::jsonb,
  -- Estructura: [{ dia: 0-6, desde: "HH:mm", hasta: "HH:mm", activo: boolean }]

  -- Otras configuraciones globales del local
  nombre_local VARCHAR(150),
  direccion TEXT,
  telefono VARCHAR(30),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE UNIQUE INDEX idx_configuracion_usuario_id ON configuracion(usuario_id);

COMMENT ON TABLE configuracion IS 'Configuración global del local por tenant';
COMMENT ON COLUMN configuracion.horario_local IS 'Horarios de atención del local en formato JSON';

-- ============================================
-- TABLA: clientes
-- Clientes del salón
-- ============================================
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  observaciones TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_clientes_usuario_id ON clientes(usuario_id);
CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE INDEX idx_clientes_telefono ON clientes(telefono);
CREATE INDEX idx_clientes_created_at ON clientes(created_at DESC);

COMMENT ON TABLE clientes IS 'Clientes del salón';

-- ============================================
-- TABLA: empleadas
-- Empleadas/profesionales del salón
-- ============================================
CREATE TABLE empleadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  activo BOOLEAN NOT NULL DEFAULT true,

  -- Horarios laborales (JSON)
  horarios JSONB DEFAULT '[]'::jsonb,
  -- Estructura: [{ dia: 0-6, desde: "HH:mm", hasta: "HH:mm" }]

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_empleadas_usuario_id ON empleadas(usuario_id);
CREATE INDEX idx_empleadas_activo ON empleadas(activo);
CREATE INDEX idx_empleadas_created_at ON empleadas(created_at DESC);

COMMENT ON TABLE empleadas IS 'Empleadas/profesionales del salón';

-- Relación opcional staff -> empleada (se agrega después para evitar referencias circulares)
ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_empleada_id
  FOREIGN KEY (empleada_id)
  REFERENCES empleadas(id)
  ON DELETE SET NULL;

-- ============================================
-- TABLA: categorias
-- Categorías de servicios
-- ============================================
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categorias_usuario_id ON categorias(usuario_id);
CREATE INDEX idx_categorias_nombre ON categorias(nombre);

COMMENT ON TABLE categorias IS 'Categorías de servicios por tenant';

-- ============================================
-- TABLA: recursos
-- Recursos compartidos (boxes/sillones/equipos)
-- ============================================
CREATE TABLE recursos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 1 CHECK (cantidad_disponible > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recursos_usuario_id ON recursos(usuario_id);
CREATE INDEX idx_recursos_nombre ON recursos(nombre);

COMMENT ON TABLE recursos IS 'Recursos operativos compartidos por servicios';

-- ============================================
-- TABLA: servicios
-- Servicios ofrecidos (cortes, color, etc.)
-- ============================================
CREATE TABLE servicios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  nombre VARCHAR(150) NOT NULL,
  precio DECIMAL(10, 2) NOT NULL CHECK (precio >= 0),
  precio_lista DECIMAL(10, 2) NOT NULL CHECK (precio_lista >= 0),
  precio_descuento DECIMAL(10, 2) CHECK (precio_descuento >= 0),
  duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  categoria VARCHAR(50) NOT NULL, -- 'principal', 'adicional', u otras categorías
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  recurso_id UUID REFERENCES recursos(id) ON DELETE SET NULL,

  -- Comisiones para empleadas
  comision_pct DECIMAL(5, 2), -- Porcentaje (ej: 40.00 = 40%)
  comision_monto_fijo DECIMAL(10, 2), -- Monto fijo

  -- Empleadas habilitadas (JSON array de IDs)
  empleadas_habilitadas JSONB DEFAULT '[]'::jsonb,
  -- Estructura: ["uuid1", "uuid2"]

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_servicios_usuario_id ON servicios(usuario_id);
CREATE INDEX idx_servicios_activo ON servicios(activo);
CREATE INDEX idx_servicios_categoria ON servicios(categoria);
CREATE INDEX idx_servicios_categoria_id ON servicios(categoria_id);
CREATE INDEX idx_servicios_recurso_id ON servicios(recurso_id);
CREATE INDEX idx_servicios_created_at ON servicios(created_at DESC);

COMMENT ON TABLE servicios IS 'Servicios ofrecidos por el salón';
COMMENT ON COLUMN servicios.categoria IS 'Categoría del servicio: principal, adicional, etc.';
COMMENT ON COLUMN servicios.categoria_id IS 'Categoría referencial del servicio';
COMMENT ON COLUMN servicios.recurso_id IS 'Recurso requerido para reservar el servicio';

-- ============================================
-- TABLA: turnos
-- Turnos/citas agendadas
-- ============================================
CREATE TABLE turno_grupos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha_inicio TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_turno_grupos_usuario_id ON turno_grupos(usuario_id);
CREATE INDEX idx_turno_grupos_cliente_id ON turno_grupos(cliente_id);
CREATE INDEX idx_turno_grupos_fecha_inicio ON turno_grupos(fecha_inicio);

COMMENT ON TABLE turno_grupos IS 'Grupos de turnos simultaneos';

CREATE TABLE turnos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  grupo_id UUID REFERENCES turno_grupos(id) ON DELETE SET NULL,

  -- Servicio (puede cambiar entre inicial y final)
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE RESTRICT,
  servicio_final_id UUID NOT NULL REFERENCES servicios(id) ON DELETE RESTRICT,

  -- Empleada (puede cambiar entre inicial y final)
  empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
  empleada_final_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,
  empleada_final_nombre VARCHAR(100), -- Snapshot nombre empleada final al momento del turno
  empleada_final_apellido VARCHAR(100), -- Snapshot apellido empleada final al momento del turno

  -- Fechas y tiempos
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),

  -- Estado del turno
  estado VARCHAR(20) NOT NULL CHECK (estado IN ('pendiente', 'en_curso', 'completado', 'cancelado')),
  asistio BOOLEAN,
  observaciones TEXT,

  -- Cambios agregados por staff durante el turno
  servicios_agregados JSONB DEFAULT '[]'::jsonb,
  productos_agregados JSONB DEFAULT '[]'::jsonb,

  -- Foto del trabajo realizada durante el turno (máximo una)
  foto_trabajo_base64 TEXT,
  foto_trabajo_storage_bucket TEXT,
  foto_trabajo_storage_path TEXT,
  foto_trabajo_mime_type TEXT,

  -- Confirmación por WhatsApp
  confirmacion_estado VARCHAR(20) NOT NULL DEFAULT 'no_enviada'
    CHECK (confirmacion_estado IN ('no_enviada', 'enviada', 'confirmado', 'no_confirmado')),
  token_confirmacion VARCHAR(255),
  confirmado_en TIMESTAMPTZ,

  -- Recordatorio automático (24hs antes)
  recordatorio_enviado_at TIMESTAMPTZ,

  -- Tiempos reales (auditoría)
  iniciado_en TIMESTAMPTZ,
  iniciado_por UUID REFERENCES usuarios(id),
  finalizado_en TIMESTAMPTZ,
  cerrado_por UUID REFERENCES usuarios(id),

  -- Variaciones
  minutos_tarde INTEGER DEFAULT 0,
  penalidad_monto DECIMAL(10, 2),
  penalidad_motivo TEXT,

  -- Auditoría
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  creado_por_username VARCHAR(255) NOT NULL,
  actualizado_por UUID REFERENCES usuarios(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fecha_fin_mayor_inicio CHECK (fecha_fin > fecha_inicio)
);

-- Índices
CREATE INDEX idx_turnos_usuario_id ON turnos(usuario_id);
CREATE INDEX idx_turnos_cliente_id ON turnos(cliente_id);
CREATE INDEX idx_turnos_grupo_id ON turnos(grupo_id);
CREATE INDEX idx_turnos_empleada_final_id ON turnos(empleada_final_id);
CREATE INDEX idx_turnos_fecha_inicio ON turnos(fecha_inicio);
CREATE INDEX idx_turnos_fecha_fin ON turnos(fecha_fin);
CREATE INDEX idx_turnos_estado ON turnos(estado);
CREATE INDEX idx_turnos_confirmacion_estado ON turnos(confirmacion_estado);
CREATE INDEX idx_turnos_created_at ON turnos(created_at DESC);
CREATE INDEX idx_turnos_foto_trabajo_storage_path ON turnos(foto_trabajo_storage_path) WHERE foto_trabajo_storage_path IS NOT NULL;

-- Índice compuesto para detectar solapamientos
CREATE INDEX idx_turnos_empleada_fechas ON turnos(empleada_final_id, fecha_inicio, fecha_fin);

COMMENT ON TABLE turnos IS 'Turnos/citas agendadas';
COMMENT ON COLUMN turnos.servicio_final_id IS 'Puede diferir de servicio_id si se cambió';
COMMENT ON COLUMN turnos.empleada_final_id IS 'Puede diferir de empleada_id si se cambió';
COMMENT ON COLUMN turnos.grupo_id IS 'Grupo para turnos simultaneos';
COMMENT ON COLUMN turnos.foto_trabajo_storage_bucket IS 'Bucket de Storage para la foto del trabajo del turno';
COMMENT ON COLUMN turnos.foto_trabajo_storage_path IS 'Path del objeto en Storage para la foto del trabajo del turno';

-- ============================================
-- TABLA: turno_servicios
-- Servicios realizados en cada turno (original y agregados)
-- ============================================
CREATE TABLE turno_servicios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE RESTRICT,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  es_original BOOLEAN NOT NULL DEFAULT false, -- true = servicio agendado originalmente
  agregado_por UUID NOT NULL REFERENCES usuarios(id),
  agregado_por_rol VARCHAR(20) NOT NULL, -- 'admin', 'recepcion', 'staff'

  precio_unitario DECIMAL(10, 2) NOT NULL CHECK (precio_unitario >= 0),
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_turno_servicios_turno_id ON turno_servicios(turno_id);
CREATE INDEX idx_turno_servicios_servicio_id ON turno_servicios(servicio_id);
CREATE INDEX idx_turno_servicios_es_original ON turno_servicios(es_original);
CREATE INDEX idx_turno_servicios_created_at ON turno_servicios(created_at DESC);

COMMENT ON TABLE turno_servicios IS 'Servicios realizados en cada turno';
COMMENT ON COLUMN turno_servicios.es_original IS 'true = servicio agendado, false = agregado durante el turno';
COMMENT ON COLUMN turno_servicios.agregado_por_rol IS 'Rol del usuario que agregó el servicio';

-- ============================================
-- TABLA: senas
-- Señas/anticipos de clientes
-- ============================================
CREATE TABLE senas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  servicio_id UUID REFERENCES servicios(id) ON DELETE RESTRICT, -- Servicio al que aplica la seña
  turno_id UUID REFERENCES turnos(id) ON DELETE SET NULL, -- Opcional

  monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
  metodo_pago VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aplicada', 'devuelta')),
  nota TEXT,

  fecha_pago TIMESTAMPTZ NOT NULL,

  -- Auditoría de aplicación
  aplicada_en TIMESTAMPTZ,
  aplicada_por UUID REFERENCES usuarios(id),

  -- Auditoría general
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_senas_usuario_id ON senas(usuario_id);
CREATE INDEX idx_senas_cliente_id ON senas(cliente_id);
CREATE INDEX idx_senas_servicio_id ON senas(servicio_id);
CREATE INDEX idx_senas_cliente_servicio ON senas(cliente_id, servicio_id);
CREATE INDEX idx_senas_estado ON senas(estado);
CREATE INDEX idx_senas_fecha_pago ON senas(fecha_pago);

COMMENT ON TABLE senas IS 'Señas o anticipos de clientes vinculadas a servicios';

-- ============================================
-- TABLA: giftcards
-- Giftcards de servicios
-- ============================================
CREATE TABLE giftcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  numero VARCHAR(20) NOT NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  servicio_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  valido_por_dias INTEGER NOT NULL CHECK (valido_por_dias > 0),
  valido_hasta TIMESTAMPTZ,
  de_parte_de VARCHAR(150),
  monto_total DECIMAL(10, 2) NOT NULL CHECK (monto_total > 0),
  metodo_pago VARCHAR(50) NOT NULL,
  facturado BOOLEAN DEFAULT false,
  estado VARCHAR(20) NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('vigente', 'usada', 'anulada')),
  usada_en TIMESTAMPTZ,
  usada_en_turno_id UUID REFERENCES turnos(id) ON DELETE SET NULL,
  imagen_base64 TEXT,
  imagen_storage_bucket TEXT,
  imagen_storage_path TEXT,
  creado_por UUID REFERENCES usuarios(id),
  creado_por_username VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_giftcards_usuario_id ON giftcards(usuario_id);
CREATE INDEX idx_giftcards_cliente_id ON giftcards(cliente_id);
CREATE INDEX idx_giftcards_numero ON giftcards(numero);
CREATE INDEX idx_giftcards_estado ON giftcards(estado);
CREATE INDEX idx_giftcards_valido_hasta ON giftcards(valido_hasta);
CREATE INDEX idx_giftcards_imagen_storage_path ON giftcards(imagen_storage_path) WHERE imagen_storage_path IS NOT NULL;

COMMENT ON TABLE giftcards IS 'Giftcards de servicios para clientes';

-- ============================================
-- TABLA: pagos
-- Pagos de servicios
-- ============================================
CREATE TABLE pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  monto DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),
  metodo_pago VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'completado'
    CHECK (estado IN ('completado', 'pendiente')),
  fecha_pago TIMESTAMPTZ NOT NULL,

  -- Seña aplicada
  sena_aplicada_id UUID REFERENCES senas(id) ON DELETE SET NULL,
  monto_sena_aplicada DECIMAL(10, 2) DEFAULT 0,

  -- Giftcard aplicada
  giftcard_aplicada_id UUID REFERENCES giftcards(id) ON DELETE SET NULL,
  monto_giftcard_aplicado DECIMAL(10, 2) DEFAULT 0,

  -- Auditoría
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_pagos_usuario_id ON pagos(usuario_id);
CREATE INDEX idx_pagos_turno_id ON pagos(turno_id);
CREATE INDEX idx_pagos_fecha_pago ON pagos(fecha_pago);
CREATE INDEX idx_pagos_metodo_pago ON pagos(metodo_pago);
CREATE INDEX idx_pagos_created_at ON pagos(created_at DESC);

COMMENT ON TABLE pagos IS 'Pagos de servicios realizados';

-- ============================================
-- TABLA: facturas
-- Comprobantes emitidos (facturas y notas de crédito)
-- ============================================
CREATE TABLE facturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  tipo VARCHAR(20) NOT NULL DEFAULT 'factura'
    CHECK (tipo IN ('factura', 'nota_credito')),
  estado VARCHAR(30) NOT NULL DEFAULT 'emitida'
    CHECK (estado IN ('emitida', 'pendiente', 'con_nota_credito', 'anulada')),

  factura_relacionada_id UUID REFERENCES facturas(id) ON DELETE SET NULL,
  nota_credito_id UUID REFERENCES facturas(id) ON DELETE SET NULL,

  origen_tipo VARCHAR(50),
  origen_id UUID,

  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre VARCHAR(150),
  cliente_apellido VARCHAR(150),

  metodo_pago VARCHAR(50),
  total DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  fecha TIMESTAMPTZ,

  punto_venta INTEGER,
  numero INTEGER,
  cbte_tipo INTEGER,
  cae VARCHAR(50),
  cae_vto VARCHAR(20),

  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  descuento_sena DECIMAL(12, 2),

  pdf_base64 TEXT,
  pdf_storage_bucket TEXT,
  pdf_storage_path TEXT,
  pdf_filename TEXT,
  nota TEXT,
  retry_payload JSONB,
  retry_intentos INTEGER NOT NULL DEFAULT 0,
  retry_ultimo_error TEXT,
  retry_ultimo_intento TIMESTAMPTZ,
  retry_proximo_intento TIMESTAMPTZ,

  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_username VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_facturas_usuario_id ON facturas(usuario_id);
CREATE INDEX idx_facturas_fecha ON facturas(fecha DESC);
CREATE INDEX idx_facturas_tipo_estado ON facturas(tipo, estado);
CREATE INDEX idx_facturas_origen ON facturas(origen_tipo, origen_id);
CREATE INDEX idx_facturas_cliente_id ON facturas(cliente_id);
CREATE INDEX idx_facturas_retry_pendientes ON facturas(retry_proximo_intento) WHERE estado = 'pendiente';
CREATE INDEX idx_facturas_pdf_storage_path ON facturas(pdf_storage_path) WHERE pdf_storage_path IS NOT NULL;

COMMENT ON TABLE facturas IS 'Comprobantes emitidos (facturas y notas de crédito)';

-- ============================================
-- TABLA: pagos_grupos
-- Cobros unificados para turnos simultaneos
-- ============================================
CREATE TABLE pagos_grupos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_grupo_id UUID NOT NULL REFERENCES turno_grupos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,

  monto DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),
  metodo_pago VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'completado'
    CHECK (estado IN ('completado', 'pendiente')),
  fecha_pago TIMESTAMPTZ NOT NULL,

  sena_aplicada_id UUID REFERENCES senas(id) ON DELETE SET NULL,
  monto_sena_aplicada DECIMAL(10, 2) DEFAULT 0,
  giftcard_aplicada_id UUID REFERENCES giftcards(id) ON DELETE SET NULL,
  monto_giftcard_aplicado DECIMAL(10, 2) DEFAULT 0,
  penalidad_monto DECIMAL(10, 2),
  observaciones TEXT,

  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagos_grupos_usuario_id ON pagos_grupos(usuario_id);
CREATE INDEX idx_pagos_grupos_grupo_id ON pagos_grupos(turno_grupo_id);
CREATE INDEX idx_pagos_grupos_fecha_pago ON pagos_grupos(fecha_pago);

COMMENT ON TABLE pagos_grupos IS 'Cobros unificados de turnos simultaneos';

-- ============================================
-- TABLA: pago_grupo_items
-- Detalle de cobro por turno dentro del grupo
-- ============================================
CREATE TABLE pago_grupo_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pago_grupo_id UUID NOT NULL REFERENCES pagos_grupos(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,

  monto DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pago_grupo_items_usuario_id ON pago_grupo_items(usuario_id);
CREATE INDEX idx_pago_grupo_items_pago_id ON pago_grupo_items(pago_grupo_id);
CREATE INDEX idx_pago_grupo_items_turno_id ON pago_grupo_items(turno_id);

COMMENT ON TABLE pago_grupo_items IS 'Detalle de montos por turno en cobros grupales';

-- ============================================
-- TABLA: adelantos
-- Adelantos a empleadas
-- ============================================
CREATE TABLE adelantos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE RESTRICT,

  monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
  motivo TEXT NOT NULL,
  fecha_entrega TIMESTAMPTZ NOT NULL,

  -- Auditoría
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_adelantos_usuario_id ON adelantos(usuario_id);
CREATE INDEX idx_adelantos_empleada_id ON adelantos(empleada_id);
CREATE INDEX idx_adelantos_fecha_entrega ON adelantos(fecha_entrega);

COMMENT ON TABLE adelantos IS 'Adelantos de pago a empleadas';

-- ============================================
-- TABLA: productos
-- Productos para venta
-- ============================================
CREATE TABLE productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  precio_lista DECIMAL(10, 2) NOT NULL CHECK (precio_lista >= 0),
  precio_descuento DECIMAL(10, 2) CHECK (precio_descuento >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,

  -- Comisiones para empleadas (igual que servicios)
  comision_pct DECIMAL(5, 2), -- Porcentaje (ej: 10.00 = 10%)
  comision_monto_fijo DECIMAL(10, 2), -- Monto fijo

  -- Auditoría
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_productos_usuario_id ON productos(usuario_id);
CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_stock_bajo ON productos(stock_actual) WHERE stock_actual <= stock_minimo;

COMMENT ON TABLE productos IS 'Productos para venta';
COMMENT ON COLUMN productos.comision_pct IS 'Porcentaje de comisión para empleadas';
COMMENT ON COLUMN productos.comision_monto_fijo IS 'Monto fijo de comisión para empleadas';

-- ============================================
-- TABLA: producto_movimientos
-- Historial de movimientos de productos
-- ============================================
CREATE TABLE producto_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  empleada_id UUID REFERENCES empleadas(id) ON DELETE SET NULL, -- Quién vendió (para comisiones)

  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('compra', 'venta', 'ajuste_positivo', 'ajuste_negativo')),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario DECIMAL(10, 2), -- Solo admin puede ver
  precio_unitario DECIMAL(10, 2),
  metodo_pago VARCHAR(50),
  nota TEXT,

  -- Auditoría
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_producto_movimientos_usuario_id ON producto_movimientos(usuario_id);
CREATE INDEX idx_producto_movimientos_producto_id ON producto_movimientos(producto_id);
CREATE INDEX idx_producto_movimientos_tipo ON producto_movimientos(tipo);
CREATE INDEX idx_producto_movimientos_created_at ON producto_movimientos(created_at DESC);

COMMENT ON TABLE producto_movimientos IS 'Historial de entradas/salidas de productos';

-- ============================================
-- TABLA: producto_compras
-- Registro de compras de productos (abastecimiento)
-- ============================================
CREATE TABLE producto_compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario DECIMAL(10, 2) NOT NULL CHECK (costo_unitario >= 0),
  nota TEXT,
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_producto_compras_usuario_id ON producto_compras(usuario_id);
CREATE INDEX idx_producto_compras_producto_id ON producto_compras(producto_id);
CREATE INDEX idx_producto_compras_created_at ON producto_compras(created_at DESC);

COMMENT ON TABLE producto_compras IS 'Compras de reposición de productos';

-- ============================================
-- TABLA: insumos
-- Insumos/materiales consumibles
-- ============================================
CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  nombre VARCHAR(150) NOT NULL,
  stock_actual DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,

  -- Auditoría
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_insumos_usuario_id ON insumos(usuario_id);
CREATE INDEX idx_insumos_activo ON insumos(activo);
CREATE INDEX idx_insumos_stock_bajo ON insumos(stock_actual) WHERE stock_actual <= stock_minimo;

COMMENT ON TABLE insumos IS 'Insumos y materiales consumibles';

-- ============================================
-- TABLA: insumo_movimientos
-- Historial de movimientos de insumos
-- ============================================
CREATE TABLE insumo_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  empleado_id UUID REFERENCES empleadas(id) ON DELETE SET NULL, -- Para entregas

  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('compra', 'ajuste_positivo', 'ajuste_negativo', 'entrega')),
  cantidad DECIMAL(10, 2) NOT NULL CHECK (cantidad > 0),
  nota TEXT,

  -- Auditoría
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_insumo_movimientos_usuario_id ON insumo_movimientos(usuario_id);
CREATE INDEX idx_insumo_movimientos_insumo_id ON insumo_movimientos(insumo_id);
CREATE INDEX idx_insumo_movimientos_tipo ON insumo_movimientos(tipo);
CREATE INDEX idx_insumo_movimientos_created_at ON insumo_movimientos(created_at DESC);

COMMENT ON TABLE insumo_movimientos IS 'Historial de entradas/salidas de insumos';

-- ============================================
-- TABLA: caja_movimientos
-- Movimientos de caja (ingresos/egresos)
-- ============================================
CREATE TABLE caja_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  medio_pago VARCHAR(50) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0 OR (monto = 0 AND source_tipo = 'arqueo')),
  motivo TEXT NOT NULL,

  -- Trazabilidad (opcional)
  source_tipo VARCHAR(50), -- turno_pago, adelanto, manual, etc.
  source_id UUID,

  -- Auditoría
  creado_por UUID NOT NULL REFERENCES usuarios(id),
  creado_por_username VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_caja_movimientos_usuario_id ON caja_movimientos(usuario_id);
CREATE INDEX idx_caja_movimientos_tipo ON caja_movimientos(tipo);
CREATE INDEX idx_caja_movimientos_medio_pago ON caja_movimientos(medio_pago);
CREATE INDEX idx_caja_movimientos_created_at ON caja_movimientos(created_at DESC);

COMMENT ON TABLE caja_movimientos IS 'Registro de ingresos y egresos de caja';

-- ============================================
-- TABLA: metodos_pago_config
-- Configuración global de métodos de pago
-- ============================================
CREATE TABLE metodos_pago_config (
  nombre VARCHAR(50) PRIMARY KEY,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_metodos_pago_config_activo ON metodos_pago_config(activo);

COMMENT ON TABLE metodos_pago_config IS 'Configuración de métodos de pago habilitados';

-- ============================================
-- TABLA: servicio_empleada_comisiones
-- Override de comisiones por servicio y empleada
-- ============================================
CREATE TABLE servicio_empleada_comisiones (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE CASCADE,

  comision_pct DECIMAL(5, 2), -- Porcentaje
  comision_monto_fijo DECIMAL(10, 2), -- Monto fijo

  PRIMARY KEY (servicio_id, empleada_id)
);

-- Índices
CREATE INDEX idx_servicio_empleada_comisiones_empleada ON servicio_empleada_comisiones(empleada_id);

COMMENT ON TABLE servicio_empleada_comisiones IS 'Comisiones específicas por empleada y servicio (override)';

-- ============================================
-- TABLA: producto_empleada_comisiones
-- Override de comisiones por producto y empleada
-- ============================================
CREATE TABLE producto_empleada_comisiones (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE CASCADE,

  comision_pct DECIMAL(5, 2), -- Porcentaje
  comision_monto_fijo DECIMAL(10, 2), -- Monto fijo

  PRIMARY KEY (producto_id, empleada_id)
);

-- Índices
CREATE INDEX idx_producto_empleada_comisiones_empleada ON producto_empleada_comisiones(empleada_id);
CREATE INDEX idx_producto_empleada_comisiones_producto ON producto_empleada_comisiones(producto_id);

COMMENT ON TABLE producto_empleada_comisiones IS 'Comisiones específicas por empleada y producto (override)';

-- ============================================
-- TABLA: empleada_ausencias
-- Ausencias de empleadas (vacaciones, licencias, etc.)
-- ============================================
CREATE TABLE empleada_ausencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empleada_id UUID NOT NULL REFERENCES empleadas(id) ON DELETE CASCADE,

  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  hora_desde VARCHAR(5), -- Formato "HH:mm", NULL = día completo
  hora_hasta VARCHAR(5), -- Formato "HH:mm", NULL = día completo
  motivo VARCHAR(50) NOT NULL CHECK (motivo IN ('vacaciones', 'licencia', 'enfermedad', 'otro')),
  descripcion TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fecha_hasta_mayor_desde CHECK (fecha_hasta >= fecha_desde),
  CONSTRAINT horario_completo_o_parcial CHECK (
    (hora_desde IS NULL AND hora_hasta IS NULL) OR
    (hora_desde IS NOT NULL AND hora_hasta IS NOT NULL AND hora_hasta > hora_desde)
  )
);

-- Índices
CREATE INDEX idx_empleada_ausencias_empleada ON empleada_ausencias(empleada_id);
CREATE INDEX idx_empleada_ausencias_fechas ON empleada_ausencias(fecha_desde, fecha_hasta);
CREATE INDEX idx_empleada_ausencias_usuario ON empleada_ausencias(usuario_id);

COMMENT ON TABLE empleada_ausencias IS 'Ausencias de empleadas (vacaciones, licencias, etc.)';
COMMENT ON COLUMN empleada_ausencias.hora_desde IS 'Hora inicio de ausencia parcial, NULL para día completo';
COMMENT ON COLUMN empleada_ausencias.hora_hasta IS 'Hora fin de ausencia parcial, NULL para día completo';

-- ============================================
-- TABLA: recordatorios
-- Recordatorios de turnos para enviar
-- ============================================
CREATE TABLE recordatorios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  cliente_telefono VARCHAR(20) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'error')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_recordatorios_usuario_id ON recordatorios(usuario_id);
CREATE INDEX idx_recordatorios_turno_id ON recordatorios(turno_id);
CREATE INDEX idx_recordatorios_estado ON recordatorios(estado);

COMMENT ON TABLE recordatorios IS 'Cola de recordatorios de turnos para envío por WhatsApp';

-- ============================================
-- TABLA: confirmation_tokens
-- Tokens de confirmación de turnos por WhatsApp
-- ============================================
CREATE TABLE confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,

  token VARCHAR(255) NOT NULL UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 days'),
  confirmado_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ, -- compatibilidad legacy
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_confirmation_tokens_token ON confirmation_tokens(token);
CREATE INDEX idx_confirmation_tokens_turno_id ON confirmation_tokens(turno_id);
CREATE INDEX idx_confirmation_tokens_expires_at ON confirmation_tokens(expires_at);
CREATE INDEX idx_confirmation_tokens_estado ON confirmation_tokens(estado);
CREATE INDEX idx_confirmation_tokens_creado_at ON confirmation_tokens(creado_at);

COMMENT ON TABLE confirmation_tokens IS 'Tokens únicos para confirmación de turnos vía WhatsApp';

-- ============================================
-- TABLA: share_links
-- Links públicos temporales para compartir comprobantes
-- ============================================
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  token VARCHAR(255) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('factura', 'giftcard', 'liquidacion')),
  resource_id UUID, -- id de factura/giftcard si aplica

  filename TEXT,
  mime_type TEXT,
  data_base64 TEXT, -- para liquidaciones u otros archivos generados
  data_storage_bucket TEXT,
  data_storage_path TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_share_links_usuario_id ON share_links(usuario_id);
CREATE INDEX idx_share_links_tipo ON share_links(tipo);
CREATE INDEX idx_share_links_expires_at ON share_links(expires_at);
CREATE INDEX idx_share_links_data_storage_path ON share_links(data_storage_path) WHERE data_storage_path IS NOT NULL;

COMMENT ON TABLE share_links IS 'Links públicos temporales para compartir comprobantes';
COMMENT ON COLUMN share_links.token IS 'Token único para el link público';
COMMENT ON COLUMN share_links.resource_id IS 'Factura/Giftcard asociada (si aplica)';
COMMENT ON COLUMN facturas.pdf_storage_bucket IS 'Bucket de Storage para el PDF del comprobante';
COMMENT ON COLUMN facturas.pdf_storage_path IS 'Path del objeto en Storage para el PDF del comprobante';
COMMENT ON COLUMN giftcards.imagen_storage_bucket IS 'Bucket de Storage para la imagen de giftcard';
COMMENT ON COLUMN giftcards.imagen_storage_path IS 'Path del objeto en Storage para la imagen de giftcard';
COMMENT ON COLUMN share_links.data_storage_bucket IS 'Bucket de Storage para archivos temporales compartidos';
COMMENT ON COLUMN share_links.data_storage_path IS 'Path del objeto en Storage para archivos temporales compartidos';

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas con updated_at
CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuracion_updated_at BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_empleadas_updated_at BEFORE UPDATE ON empleadas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorias_updated_at BEFORE UPDATE ON categorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recursos_updated_at BEFORE UPDATE ON recursos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_servicios_updated_at BEFORE UPDATE ON servicios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_turnos_updated_at BEFORE UPDATE ON turnos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_senas_updated_at BEFORE UPDATE ON senas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insumos_updated_at BEFORE UPDATE ON insumos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION set_confirmation_token_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.usuario_id IS NULL THEN
    SELECT usuario_id INTO NEW.usuario_id FROM turnos WHERE id = NEW.turno_id;
  END IF;
  IF NEW.estado IS NULL THEN
    NEW.estado := 'pendiente';
  END IF;
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '2 days';
  END IF;
  IF NEW.creado_at IS NULL THEN
    NEW.creado_at := NOW();
  END IF;
  IF NEW.confirmado_at IS NULL AND NEW.confirmed_at IS NOT NULL THEN
    NEW.confirmado_at := NEW.confirmed_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_confirmation_tokens_defaults
BEFORE INSERT ON confirmation_tokens
FOR EACH ROW EXECUTE FUNCTION set_confirmation_token_defaults();

-- ============================================
-- DATOS INICIALES (SEED)
-- ============================================

-- Métodos de pago por defecto
INSERT INTO metodos_pago_config (nombre, activo) VALUES
  ('efectivo', true),
  ('tarjeta', true),
  ('transferencia', true)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- PERMISOS Y SEGURIDAD
-- ============================================

-- Si usas Row Level Security (RLS), descomentar:
-- ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ... (habilitar para todas las tablas con usuario_id)

-- Crear políticas RLS de ejemplo:
-- CREATE POLICY usuarios_tenant_isolation ON usuarios
--   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista: Turnos con información completa
CREATE OR REPLACE VIEW v_turnos_completos AS
SELECT
  t.*,
  c.nombre AS cliente_nombre,
  c.apellido AS cliente_apellido,
  c.telefono AS cliente_telefono,
  e.nombre AS empleada_nombre,
  e.apellido AS empleada_apellido,
  s.nombre AS servicio_nombre,
  s.precio AS servicio_precio,
  sf.nombre AS servicio_final_nombre,
  sf.precio AS servicio_final_precio
FROM turnos t
LEFT JOIN clientes c ON t.cliente_id = c.id
LEFT JOIN empleadas e ON t.empleada_final_id = e.id
LEFT JOIN servicios s ON t.servicio_id = s.id
LEFT JOIN servicios sf ON t.servicio_final_id = sf.id;

COMMENT ON VIEW v_turnos_completos IS 'Vista de turnos con datos relacionados expandidos';

-- Vista: Stock bajo de productos
CREATE OR REPLACE VIEW v_productos_stock_bajo AS
SELECT
  p.*,
  (p.stock_minimo - p.stock_actual) AS cantidad_faltante
FROM productos p
WHERE p.stock_actual <= p.stock_minimo
  AND p.activo = true
ORDER BY p.stock_actual ASC;

COMMENT ON VIEW v_productos_stock_bajo IS 'Productos con stock por debajo del mínimo';

-- Vista: Stock bajo de insumos
CREATE OR REPLACE VIEW v_insumos_stock_bajo AS
SELECT
  i.*,
  (i.stock_minimo - i.stock_actual) AS cantidad_faltante
FROM insumos i
WHERE i.stock_actual <= i.stock_minimo
  AND i.activo = true
ORDER BY i.stock_actual ASC;

COMMENT ON VIEW v_insumos_stock_bajo IS 'Insumos con stock por debajo del mínimo';

-- Vista: Resumen de caja por método de pago
CREATE OR REPLACE VIEW v_caja_resumen AS
SELECT
  usuario_id,
  medio_pago,
  SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) AS total_ingresos,
  SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) AS total_egresos,
  SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS saldo
FROM caja_movimientos
GROUP BY usuario_id, medio_pago;

COMMENT ON VIEW v_caja_resumen IS 'Resumen de caja por método de pago';

-- Vista: Servicios de turno (original vs realizado)
CREATE OR REPLACE VIEW v_turno_servicios_detalle AS
SELECT
  ts.*,
  t.estado AS turno_estado,
  t.fecha_inicio AS turno_fecha,
  s.nombre AS servicio_nombre,
  s.categoria AS servicio_categoria,
  u.username AS agregado_por_username
FROM turno_servicios ts
JOIN turnos t ON ts.turno_id = t.id
JOIN servicios s ON ts.servicio_id = s.id
JOIN usuarios u ON ts.agregado_por = u.id;

COMMENT ON VIEW v_turno_servicios_detalle IS 'Vista de servicios por turno con detalle de quién agregó';

-- ============================================
-- ÍNDICES ADICIONALES PARA REPORTES
-- ============================================

-- Para reportes de liquidaciones
CREATE INDEX idx_pagos_fecha_pago_metodo ON pagos(fecha_pago, metodo_pago);
CREATE INDEX idx_turnos_empleada_fecha ON turnos(empleada_final_id, fecha_inicio);

-- Para búsquedas de texto
CREATE INDEX idx_clientes_nombre_apellido ON clientes USING gin(
  to_tsvector('spanish', nombre || ' ' || apellido)
);

-- ============================================
-- FUNCIONES DE UTILIDAD
-- ============================================

-- Función para calcular comisión de empleada en un turno
CREATE OR REPLACE FUNCTION calcular_comision_turno(
  p_servicio_id UUID,
  p_empleada_id UUID,
  p_monto_servicio DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  v_comision_pct DECIMAL;
  v_comision_fijo DECIMAL;
  v_comision_total DECIMAL := 0;
BEGIN
  -- Buscar comisión específica para empleada-servicio
  SELECT comision_pct, comision_monto_fijo
  INTO v_comision_pct, v_comision_fijo
  FROM servicio_empleada_comisiones
  WHERE servicio_id = p_servicio_id
    AND empleada_id = p_empleada_id;

  -- Si no hay específica, usar la del servicio
  IF v_comision_pct IS NULL AND v_comision_fijo IS NULL THEN
    SELECT comision_pct, comision_monto_fijo
    INTO v_comision_pct, v_comision_fijo
    FROM servicios
    WHERE id = p_servicio_id;
  END IF;

  -- Calcular comisión
  IF v_comision_pct IS NOT NULL THEN
    v_comision_total := v_comision_total + (p_monto_servicio * v_comision_pct / 100);
  END IF;

  IF v_comision_fijo IS NOT NULL THEN
    v_comision_total := v_comision_total + v_comision_fijo;
  END IF;

  RETURN COALESCE(v_comision_total, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calcular_comision_turno IS 'Calcula la comisión de una empleada para un turno';

-- ============================================
-- BACKUP Y MANTENIMIENTO
-- ============================================

-- Para hacer backup:
-- pg_dump -U usuario -d narella_turnos -F c -b -v -f "backup_$(date +%Y%m%d).dump"

-- Para restaurar:
-- pg_restore -U usuario -d narella_turnos -v "backup_20260126.dump"

-- ============================================
-- FIN DEL SCHEMA
-- ============================================
