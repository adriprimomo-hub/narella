-- Completa tablas faltantes de la app y endurece compatibilidad de confirmation_tokens

BEGIN;

-- ============================================
-- TABLA: categorias
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categorias_usuario_id ON categorias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias(nombre);

-- ============================================
-- TABLA: recursos
-- ============================================
CREATE TABLE IF NOT EXISTS recursos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 1 CHECK (cantidad_disponible > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recursos_usuario_id ON recursos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_recursos_nombre ON recursos(nombre);

-- ============================================
-- TABLA: servicios (columnas referenciales)
-- ============================================
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS recurso_id UUID REFERENCES recursos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_servicios_categoria_id ON servicios(categoria_id);
CREATE INDEX IF NOT EXISTS idx_servicios_recurso_id ON servicios(recurso_id);

-- ============================================
-- TABLA: producto_compras
-- ============================================
CREATE TABLE IF NOT EXISTS producto_compras (
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

CREATE INDEX IF NOT EXISTS idx_producto_compras_usuario_id ON producto_compras(usuario_id);
CREATE INDEX IF NOT EXISTS idx_producto_compras_producto_id ON producto_compras(producto_id);
CREATE INDEX IF NOT EXISTS idx_producto_compras_created_at ON producto_compras(created_at DESC);

-- ============================================
-- TABLA: confirmation_tokens (compatibilidad total con app)
-- ============================================
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente';
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMPTZ;
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE confirmation_tokens
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '2 days');

UPDATE confirmation_tokens
SET estado = COALESCE(estado, 'pendiente')
WHERE estado IS NULL;

UPDATE confirmation_tokens
SET creado_at = COALESCE(creado_at, created_at, NOW())
WHERE creado_at IS NULL;

UPDATE confirmation_tokens
SET confirmado_at = confirmed_at
WHERE confirmado_at IS NULL
  AND confirmed_at IS NOT NULL;

UPDATE confirmation_tokens
SET expires_at = COALESCE(expires_at, created_at + INTERVAL '2 days', NOW() + INTERVAL '2 days')
WHERE expires_at IS NULL;

ALTER TABLE confirmation_tokens
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_estado ON confirmation_tokens(estado);
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_creado_at ON confirmation_tokens(creado_at);

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

DROP TRIGGER IF EXISTS trg_confirmation_tokens_defaults ON confirmation_tokens;
CREATE TRIGGER trg_confirmation_tokens_defaults
BEFORE INSERT ON confirmation_tokens
FOR EACH ROW EXECUTE PROCEDURE set_confirmation_token_defaults();

-- updated_at triggers para tablas nuevas
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_categorias_updated_at ON categorias;
CREATE TRIGGER update_categorias_updated_at BEFORE UPDATE ON categorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recursos_updated_at ON recursos;
CREATE TRIGGER update_recursos_updated_at BEFORE UPDATE ON recursos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
