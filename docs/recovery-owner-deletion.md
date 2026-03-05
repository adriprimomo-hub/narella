# Recuperacion Ante Borrado De Owner (Tenant)

## Cuando usarlo
Si el sistema aparece vacio luego de eliminar un usuario admin/owner o si hay usuarios con `tenant_id` apuntando a un owner inexistente.

## Paso 1 - Diagnostico rapido
Ejecutar:

```bash
node scripts/tenant-recovery.js verify
```

Que valida:
- usuarios existentes
- tenant_id rotos (owner inexistente)
- conteo de filas por tenant en tablas de negocio

## Paso 2 - Reparar tenant_id roto (sin tocar datos)
Primero ver plan:

```bash
node scripts/tenant-recovery.js repair
```

Aplicar:

```bash
node scripts/tenant-recovery.js repair --apply
```

Opciones utiles:

```bash
node scripts/tenant-recovery.js repair --apply --broken-tenant <tenant_id_roto> --owner <user_id_owner_nuevo>
node scripts/tenant-recovery.js repair --apply --broken-tenant <tenant_id_roto> --owner <user_id_owner_nuevo> --move-data
node scripts/tenant-recovery.js move-data --from-tenant <tenant_id_viejo> --to-tenant <tenant_id_nuevo>
node scripts/tenant-recovery.js move-data --from-tenant <tenant_id_viejo> --to-tenant <tenant_id_nuevo> --apply
```

Notas:
- `--move-data` intenta reasignar `usuario_id` en tablas de negocio desde tenant viejo a owner nuevo.
- Usar `--move-data` solo cuando confirmes que esa data no debe quedar en el tenant anterior.
- `move-data` sirve tambien cuando ya corregiste `tenant_id` y quedaron filas colgadas en el tenant viejo.

## Paso 3 - Si los datos no estan (filas en 0)
Si el diagnostico muestra tablas en `0` filas, la reparacion de tenant no alcanza.
Hay que restaurar desde Supabase:

1. Abrir Supabase Dashboard.
2. Ir a `Database > Backups`.
3. Restaurar a un punto anterior al borrado accidental.
4. Repetir `node scripts/tenant-recovery.js verify`.

## Paso 4 - Hardening permanente
Aplicar migraciones para evitar recurrencia:

```bash
npx supabase db push
```

La migracion `20260305104500_prevent_owner_delete_and_orphan_tenant_ids.sql` agrega:
- trigger que bloquea borrar users con tenant dependiente
- trigger que bloquea borrar users con datos asociados (`usuario_id`)
- trigger que valida que `tenant_id` siempre apunte a un owner valido (o self-owner)
