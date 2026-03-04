-- Declaraciones juradas + configuración de mensajería/branding por tenant

ALTER TABLE IF EXISTS public.configuracion
  ADD COLUMN IF NOT EXISTS wa_template_confirmaciones TEXT,
  ADD COLUMN IF NOT EXISTS wa_template_facturas_giftcards TEXT,
  ADD COLUMN IF NOT EXISTS wa_template_liquidaciones TEXT,
  ADD COLUMN IF NOT EXISTS wa_template_servicios_vencidos TEXT,
  ADD COLUMN IF NOT EXISTS wa_template_declaraciones_juradas TEXT,
  ADD COLUMN IF NOT EXISTS giftcard_template_data_url TEXT;

CREATE TABLE IF NOT EXISTS public.declaraciones_juradas_plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  texto_intro TEXT NOT NULL DEFAULT '',
  campos JSONB NOT NULL DEFAULT '[]'::jsonb,
  requiere_firma BOOLEAN NOT NULL DEFAULT TRUE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_declaraciones_juradas_plantillas_usuario
ON public.declaraciones_juradas_plantillas(usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_declaraciones_juradas_plantillas_usuario_activa
ON public.declaraciones_juradas_plantillas(usuario_id, activa);

CREATE TABLE IF NOT EXISTS public.declaraciones_juradas_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  plantilla_id UUID NOT NULL REFERENCES public.declaraciones_juradas_plantillas(id) ON DELETE CASCADE,
  turno_id UUID NOT NULL,
  cliente_id UUID,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada', 'expirada', 'cancelada')),
  link_expires_at TIMESTAMPTZ,
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  firma_data_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_declaraciones_juradas_respuestas_token
ON public.declaraciones_juradas_respuestas(token);

CREATE INDEX IF NOT EXISTS idx_declaraciones_juradas_respuestas_usuario_turno
ON public.declaraciones_juradas_respuestas(usuario_id, turno_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_declaraciones_juradas_respuestas_usuario_estado
ON public.declaraciones_juradas_respuestas(usuario_id, estado, created_at DESC);

ALTER TABLE IF EXISTS public.turnos
  ADD COLUMN IF NOT EXISTS declaracion_jurada_plantilla_id UUID,
  ADD COLUMN IF NOT EXISTS declaracion_jurada_respuesta_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'turnos_declaracion_jurada_plantilla_id_fkey'
  ) THEN
    ALTER TABLE public.turnos
      ADD CONSTRAINT turnos_declaracion_jurada_plantilla_id_fkey
      FOREIGN KEY (declaracion_jurada_plantilla_id)
      REFERENCES public.declaraciones_juradas_plantillas(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'turnos_declaracion_jurada_respuesta_id_fkey'
  ) THEN
    ALTER TABLE public.turnos
      ADD CONSTRAINT turnos_declaracion_jurada_respuesta_id_fkey
      FOREIGN KEY (declaracion_jurada_respuesta_id)
      REFERENCES public.declaraciones_juradas_respuestas(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_turnos_declaracion_jurada_plantilla
ON public.turnos(usuario_id, declaracion_jurada_plantilla_id)
WHERE declaracion_jurada_plantilla_id IS NOT NULL;

ALTER TABLE IF EXISTS public.declaraciones_juradas_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.declaraciones_juradas_respuestas ENABLE ROW LEVEL SECURITY;
