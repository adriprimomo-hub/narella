ALTER TABLE IF EXISTS public.facturas
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS creado_por_username TEXT;

ALTER TABLE IF EXISTS public.giftcards
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS creado_por_username TEXT;

UPDATE public.facturas
SET creado_por = COALESCE(creado_por, usuario_id)
WHERE creado_por IS NULL;

UPDATE public.giftcards
SET creado_por = COALESCE(creado_por, usuario_id)
WHERE creado_por IS NULL;
