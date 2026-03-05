-- Protect tenant owners and avoid orphan tenant_id references in public.usuarios.

CREATE OR REPLACE FUNCTION public.prevent_usuarios_dangerous_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_tenant_members BOOLEAN := FALSE;
  has_data_refs BOOLEAN := FALSE;
  tenant_table RECORD;
BEGIN
  -- If other users still point to this id as tenant owner, block deletion.
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.tenant_id = OLD.id
      AND u.id <> OLD.id
  )
  INTO has_tenant_members;

  IF has_tenant_members THEN
    RAISE EXCEPTION 'No puedes eliminar el usuario owner del tenant (%). Reasigna tenant_id primero.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  -- Block deletion if any tenant-scoped table still has rows for this usuario_id.
  FOR tenant_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'usuario_id'
      AND c.table_name <> 'usuarios'
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE usuario_id = $1)',
      tenant_table.table_name
    )
    INTO has_data_refs
    USING OLD.id;

    IF has_data_refs THEN
      RAISE EXCEPTION 'No puedes eliminar el usuario %. Hay datos asociados en public.% (usuario_id).', OLD.id, tenant_table.table_name
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_usuarios_dangerous_delete ON public.usuarios;

CREATE TRIGGER trg_prevent_usuarios_dangerous_delete
BEFORE DELETE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.prevent_usuarios_dangerous_delete();

CREATE OR REPLACE FUNCTION public.validate_usuarios_tenant_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := NEW.id;
  END IF;

  -- Owner row can self-reference during insert.
  IF NEW.tenant_id <> NEW.id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios owner_user
      WHERE owner_user.id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'tenant_id (%) no existe en public.usuarios', NEW.tenant_id
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_usuarios_tenant_owner ON public.usuarios;

CREATE TRIGGER trg_validate_usuarios_tenant_owner
BEFORE INSERT OR UPDATE OF tenant_id ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.validate_usuarios_tenant_owner();

