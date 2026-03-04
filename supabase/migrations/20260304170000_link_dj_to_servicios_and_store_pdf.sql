-- Relacionar DJ por servicio y guardar DJ respondida como PDF

ALTER TABLE IF EXISTS public.servicios
  ADD COLUMN IF NOT EXISTS declaracion_jurada_plantilla_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servicios_declaracion_jurada_plantilla_id_fkey'
  ) THEN
    ALTER TABLE public.servicios
      ADD CONSTRAINT servicios_declaracion_jurada_plantilla_id_fkey
      FOREIGN KEY (declaracion_jurada_plantilla_id)
      REFERENCES public.declaraciones_juradas_plantillas(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_servicios_declaracion_jurada_plantilla
ON public.servicios(usuario_id, declaracion_jurada_plantilla_id)
WHERE declaracion_jurada_plantilla_id IS NOT NULL;

ALTER TABLE IF EXISTS public.declaraciones_juradas_respuestas
  ADD COLUMN IF NOT EXISTS pdf_base64 TEXT,
  ADD COLUMN IF NOT EXISTS pdf_filename TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
