-- Align Supabase schema with current app expectations

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
-- TABLA: servicios (nuevas columnas)
-- ============================================
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_lista DECIMAL(10, 2);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS precio_descuento DECIMAL(10, 2);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS recurso_id UUID REFERENCES recursos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_servicios_categoria_id ON servicios(categoria_id);
CREATE INDEX IF NOT EXISTS idx_servicios_recurso_id ON servicios(recurso_id);

UPDATE servicios
SET precio_lista = precio
WHERE precio_lista IS NULL;

ALTER TABLE servicios ALTER COLUMN precio_lista SET NOT NULL;

ALTER TABLE servicios ALTER COLUMN categoria SET DEFAULT 'principal';
UPDATE servicios
SET categoria = 'principal'
WHERE categoria IS NULL;

-- ============================================
-- TABLA: turnos (campos de confirmacion)
-- ============================================
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS confirmacion_enviada_at TIMESTAMPTZ;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS confirmacion_confirmada_at TIMESTAMPTZ;

-- Ajustar CHECK de confirmacion_estado para incluir "cancelado"
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'turnos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%confirmacion_estado%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE turnos DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE turnos
  ADD CONSTRAINT turnos_confirmacion_estado_check
  CHECK (confirmacion_estado IN ('no_enviada', 'enviada', 'confirmado', 'no_confirmado', 'cancelado'));

-- ============================================
-- TABLA: confirmation_tokens (compatibilidad)
-- ============================================
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente';
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS confirmado_at TIMESTAMPTZ;
ALTER TABLE confirmation_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE confirmation_tokens
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '2 days');

CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_estado ON confirmation_tokens(estado);
CREATE INDEX IF NOT EXISTS idx_confirmation_tokens_creado_at ON confirmation_tokens(creado_at);

UPDATE confirmation_tokens
SET estado = 'pendiente'
WHERE estado IS NULL;

UPDATE confirmation_tokens
SET creado_at = created_at
WHERE creado_at IS NULL;

CREATE OR REPLACE FUNCTION set_confirmation_token_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.usuario_id IS NULL THEN
    SELECT usuario_id INTO NEW.usuario_id FROM turnos WHERE id = NEW.turno_id;
  END IF;
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '2 days';
  END IF;
  IF NEW.estado IS NULL THEN
    NEW.estado := 'pendiente';
  END IF;
  IF NEW.creado_at IS NULL THEN
    NEW.creado_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_confirmation_tokens_defaults ON confirmation_tokens;
CREATE TRIGGER trg_confirmation_tokens_defaults
BEFORE INSERT ON confirmation_tokens
FOR EACH ROW EXECUTE PROCEDURE set_confirmation_token_defaults();

-- Refrescar cache de PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
