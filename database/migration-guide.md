# Guía de Migración: JSON Local → PostgreSQL

Esta guía te ayudará a migrar tu sistema actual (que usa archivos JSON) a PostgreSQL sin perder datos.

---

## Fase 1: Preparación (1-2 días)

### ✅ Checklist Pre-Migración

- [ ] Backup del sistema actual (.localdb.json)
- [ ] PostgreSQL instalado y configurado en VPS
- [ ] Schema importado correctamente
- [ ] Conexión desde la app funcionando
- [ ] Datos de prueba (seed) cargados

### 1.1 Hacer Backup Completo

```bash
# En tu máquina local
# Copiar el archivo de datos actual
cp .localdb.json .localdb.backup.$(date +%Y%m%d_%H%M%S).json

# Hacer backup de toda la carpeta
tar -czf narella-backup-$(date +%Y%m%d).tar.gz \
  .localdb.json \
  lib/localdb/ \
  app/api/

# Subir a un lugar seguro
# Opción 1: Google Drive, Dropbox, etc.
# Opción 2: S3, Backblaze, etc.
```

### 1.2 Instalar Dependencias

```bash
npm install pg
npm install -D @types/pg

# Opcional: bcrypt para hashear passwords
npm install bcrypt
npm install -D @types/bcrypt
```

### 1.3 Configurar Variables de Entorno

```bash
# .env.local
DATABASE_URL="postgresql://narella_user:PASSWORD@IP_VPS:5432/narella_db"

# Para desarrollo local (opcional)
DATABASE_URL_DEV="postgresql://narella_user:PASSWORD@localhost:5432/narella_db_dev"
```

---

## Fase 2: Script de Migración (1 día)

### 2.1 Crear Script de Migración

Crear archivo: `scripts/migrate-to-postgres.ts`

```typescript
import fs from 'fs'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Leer datos del JSON actual
const dbFilePath = process.env.LOCALDB_FILE || '.localdb.json'
let localData: any = {}

if (fs.existsSync(dbFilePath)) {
  const raw = fs.readFileSync(dbFilePath, 'utf8')
  localData = JSON.parse(raw)
  console.log('✓ Datos locales cargados')
} else {
  console.error('✗ Archivo .localdb.json no encontrado')
  process.exit(1)
}

async function migrateUsuarios() {
  console.log('\n=== Migrando Usuarios ===')

  for (const user of localData.usuarios || []) {
    // Hashear password
    const passwordHash = user.password
      ? await bcrypt.hash(user.password, 10)
      : null

    await pool.query(
      `INSERT INTO usuarios (
        id, username, password_hash, rol, tenant_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [
        user.id,
        user.username,
        passwordHash,
        user.rol,
        user.tenant_id,
        user.created_at || new Date().toISOString(),
        user.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.usuarios?.length || 0} usuarios migrados`)
}

// La configuración del local (ej. horario_local) se migra en la tabla configuracion.
// No se guarda en usuarios.

async function migrateClientes() {
  console.log('\n=== Migrando Clientes ===')

  for (const cliente of localData.clientes || []) {
    await pool.query(
      `INSERT INTO clientes (
        id, usuario_id, nombre, apellido, telefono, observaciones,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        cliente.id,
        cliente.usuario_id,
        cliente.nombre,
        cliente.apellido,
        cliente.telefono,
        cliente.observaciones,
        cliente.created_at || new Date().toISOString(),
        cliente.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.clientes?.length || 0} clientes migrados`)
}

async function migrateEmpleadas() {
  console.log('\n=== Migrando Empleadas ===')

  for (const empleada of localData.empleadas || []) {
    await pool.query(
      `INSERT INTO empleadas (
        id, usuario_id, nombre, apellido, telefono, activo,
        horarios, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        empleada.id,
        empleada.usuario_id,
        empleada.nombre,
        empleada.apellido,
        empleada.telefono,
        empleada.activo ?? true,
        JSON.stringify(empleada.horarios || []),
        empleada.created_at || new Date().toISOString(),
        empleada.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.empleadas?.length || 0} empleadas migradas`)
}

async function migrateServicios() {
  console.log('\n=== Migrando Servicios ===')

  for (const servicio of localData.servicios || []) {
    await pool.query(
      `INSERT INTO servicios (
        id, usuario_id, nombre, precio, duracion_minutos, activo, tipo,
        precios_por_metodo, recargos_por_metodo,
        comision_pct, comision_monto_fijo, empleadas_habilitadas,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING`,
      [
        servicio.id,
        servicio.usuario_id,
        servicio.nombre,
        servicio.precio,
        servicio.duracion_minutos,
        servicio.activo ?? true,
        servicio.tipo,
        JSON.stringify(servicio.precios_por_metodo || {}),
        JSON.stringify(servicio.recargos_por_metodo || {}),
        servicio.comision_pct,
        servicio.comision_monto_fijo,
        JSON.stringify(servicio.empleadas_habilitadas || []),
        servicio.created_at || new Date().toISOString(),
        servicio.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.servicios?.length || 0} servicios migrados`)
}

async function migrateAdicionales() {
  console.log('\n=== Migrando Adicionales ===')

  for (const adicional of localData.adicionales || []) {
    await pool.query(
      `INSERT INTO adicionales (
        id, usuario_id, nombre, precio, activo, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [
        adicional.id,
        adicional.usuario_id,
        adicional.nombre,
        adicional.precio,
        adicional.activo ?? true,
        adicional.created_at || new Date().toISOString(),
        adicional.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.adicionales?.length || 0} adicionales migrados`)
}

async function migrateTurnos() {
  console.log('\n=== Migrando Turnos ===')

  for (const turno of localData.turnos || []) {
    await pool.query(
      `INSERT INTO turnos (
        id, usuario_id, cliente_id,
        servicio_id, servicio_final_id,
        empleada_id, empleada_final_id,
        fecha_inicio, fecha_fin, duracion_minutos,
        estado, asistio, observaciones,
        confirmacion_estado, token_confirmacion, confirmado_en,
        iniciado_en, iniciado_por, finalizado_en, cerrado_por,
        minutos_tarde, penalidad_monto, penalidad_motivo,
        creado_por, creado_por_username, actualizado_por,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        turno.id,
        turno.usuario_id,
        turno.cliente_id,
        turno.servicio_id,
        turno.servicio_final_id,
        turno.empleada_id,
        turno.empleada_final_id,
        turno.fecha_inicio,
        turno.fecha_fin,
        turno.duracion_minutos,
        turno.estado,
        turno.asistio,
        turno.observaciones,
        turno.confirmacion_estado || 'no_enviada',
        turno.token_confirmacion,
        turno.confirmado_en,
        turno.iniciado_en,
        turno.iniciado_por,
        turno.finalizado_en,
        turno.cerrado_por,
        turno.minutos_tarde,
        turno.penalidad_monto,
        turno.penalidad_motivo,
        turno.creado_por,
        turno.creado_por_username,
        turno.actualizado_por,
        turno.created_at || new Date().toISOString(),
        turno.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.turnos?.length || 0} turnos migrados`)
}

async function migrateSenas() {
  console.log('\n=== Migrando Señas ===')

  for (const sena of localData.senas || []) {
    await pool.query(
      `INSERT INTO senas (
        id, usuario_id, cliente_id, turno_id, monto, metodo_pago,
        estado, nota, fecha_pago, aplicada_en, aplicada_por,
        creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING`,
      [
        sena.id,
        sena.usuario_id,
        sena.cliente_id,
        sena.turno_id,
        sena.monto,
        sena.metodo_pago,
        sena.estado || 'pendiente',
        sena.nota,
        sena.fecha_pago,
        sena.aplicada_en,
        sena.aplicada_por,
        sena.creado_por_username,
        sena.created_at || new Date().toISOString(),
        sena.updated_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.senas?.length || 0} señas migradas`)
}

async function migratePagos() {
  console.log('\n=== Migrando Pagos ===')

  for (const pago of localData.pagos || []) {
    await pool.query(
      `INSERT INTO pagos (
        id, usuario_id, turno_id, monto, metodo_pago, estado,
        fecha_pago, sena_aplicada_id, monto_sena_aplicada,
        detalle_adicionales, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING`,
      [
        pago.id,
        pago.usuario_id,
        pago.turno_id,
        pago.monto,
        pago.metodo_pago,
        pago.estado || 'completado',
        pago.fecha_pago,
        pago.sena_aplicada_id,
        pago.monto_sena_aplicada || 0,
        JSON.stringify(pago.detalle_adicionales || []),
        pago.creado_por_username,
        pago.created_at || new Date().toISOString(),
      ]
    )
  }

  console.log(`✓ ${localData.pagos?.length || 0} pagos migrados`)
}

// Continuar con el resto de tablas...
async function migrateAdelantos() {
  console.log('\n=== Migrando Adelantos ===')
  for (const adelanto of localData.adelantos || []) {
    await pool.query(
      `INSERT INTO adelantos (
        id, usuario_id, empleada_id, monto, motivo, fecha_entrega,
        creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        adelanto.id,
        adelanto.usuario_id,
        adelanto.empleada_id,
        adelanto.monto,
        adelanto.motivo,
        adelanto.fecha_entrega,
        adelanto.creado_por_username,
        adelanto.created_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`✓ ${localData.adelantos?.length || 0} adelantos migrados`)
}

async function migrateProductos() {
  console.log('\n=== Migrando Productos ===')
  for (const producto of localData.productos || []) {
    await pool.query(
      `INSERT INTO productos (
        id, usuario_id, nombre, descripcion, stock_actual, stock_minimo,
        precio_venta, activo, creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        producto.id,
        producto.usuario_id,
        producto.nombre,
        producto.descripcion,
        producto.stock_actual || 0,
        producto.stock_minimo || 0,
        producto.precio_venta,
        producto.activo ?? true,
        producto.creado_por_username,
        producto.created_at || new Date().toISOString(),
        producto.updated_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`✓ ${localData.productos?.length || 0} productos migrados`)
}

async function migrateInsumos() {
  console.log('\n=== Migrando Insumos ===')
  for (const insumo of localData.insumos || []) {
    await pool.query(
      `INSERT INTO insumos (
        id, usuario_id, nombre, stock_actual, stock_minimo,
        activo, creado_por_username, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        insumo.id,
        insumo.usuario_id,
        insumo.nombre,
        insumo.stock_actual || 0,
        insumo.stock_minimo || 0,
        insumo.activo ?? true,
        insumo.creado_por_username,
        insumo.created_at || new Date().toISOString(),
        insumo.updated_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`✓ ${localData.insumos?.length || 0} insumos migrados`)
}

async function migrateCajaMovimientos() {
  console.log('\n=== Migrando Movimientos de Caja ===')
  for (const mov of localData.caja_movimientos || []) {
    await pool.query(
      `INSERT INTO caja_movimientos (
        id, usuario_id, medio_pago, tipo, monto, motivo,
        source_tipo, source_id, creado_por, creado_por_username, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        mov.id,
        mov.usuario_id,
        mov.medio_pago,
        mov.tipo,
        mov.monto,
        mov.motivo,
        mov.source_tipo,
        mov.source_id,
        mov.creado_por,
        mov.creado_por_username,
        mov.created_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`✓ ${localData.caja_movimientos?.length || 0} movimientos migrados`)
}

async function migrateMetodosPagoConfig() {
  console.log('\n=== Migrando Configuración de Métodos de Pago ===')
  for (const metodo of localData.metodos_pago_config || []) {
    await pool.query(
      `INSERT INTO metodos_pago_config (
        nombre, ajuste_tipo, ajuste_valor, activo, created_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (nombre) DO UPDATE SET
        ajuste_tipo = EXCLUDED.ajuste_tipo,
        ajuste_valor = EXCLUDED.ajuste_valor,
        activo = EXCLUDED.activo`,
      [
        metodo.nombre,
        metodo.ajuste_tipo,
        metodo.ajuste_valor,
        metodo.activo ?? true,
        metodo.created_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`✓ ${localData.metodos_pago_config?.length || 0} métodos migrados`)
}

// Función principal
async function main() {
  console.log('==========================================')
  console.log('   MIGRACIÓN: JSON → PostgreSQL')
  console.log('==========================================')

  try {
    // Orden importante: respeta las FK
    await migrateUsuarios()
    await migrateClientes()
    await migrateEmpleadas()
    await migrateServicios()
    await migrateAdicionales()
    await migrateTurnos()
    await migrateSenas()
    await migratePagos()
    await migrateAdelantos()
    await migrateProductos()
    await migrateInsumos()
    await migrateCajaMovimientos()
    await migrateMetodosPagoConfig()

    console.log('\n==========================================')
    console.log('✓ MIGRACIÓN COMPLETADA EXITOSAMENTE')
    console.log('==========================================\n')

    // Verificar datos migrados
    const result = await pool.query(`
      SELECT
        'usuarios' as tabla, COUNT(*) as cantidad FROM usuarios
      UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
      UNION ALL SELECT 'empleadas', COUNT(*) FROM empleadas
      UNION ALL SELECT 'servicios', COUNT(*) FROM servicios
      UNION ALL SELECT 'turnos', COUNT(*) FROM turnos
      UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
      UNION ALL SELECT 'senas', COUNT(*) FROM senas
    `)

    console.log('Resumen de datos migrados:')
    result.rows.forEach((row) => {
      console.log(`  ${row.tabla}: ${row.cantidad}`)
    })
  } catch (error) {
    console.error('\n✗ ERROR EN LA MIGRACIÓN:', error)
    throw error
  } finally {
    await pool.end()
  }
}

main()
```

### 2.2 Ejecutar Migración

```bash
# Configurar DATABASE_URL
export DATABASE_URL="postgresql://narella_user:PASSWORD@IP_VPS:5432/narella_db"

# Ejecutar script
npx tsx scripts/migrate-to-postgres.ts
```

---

## Fase 3: Adaptar el Código (2-3 días)

### 3.1 Crear Capa de Abstracción

Archivo: `lib/db/postgres.ts`

```typescript
// Copiar el contenido de database/example-client.ts
```

### 3.2 Reemplazar Queries - Ejemplo

**Antes (localdb):**
```typescript
// app/api/clientes/route.ts
import { db } from '@/lib/localdb/store'

export async function GET() {
  const clientes = db.clientes.filter(c => c.usuario_id === user.id)
  return Response.json(clientes)
}
```

**Después (PostgreSQL):**
```typescript
// app/api/clientes/route.ts
import { query } from '@/lib/db/postgres'

export async function GET() {
  const result = await query(
    'SELECT * FROM clientes WHERE usuario_id = $1 ORDER BY created_at DESC',
    [user.id]
  )
  return Response.json(result.rows)
}
```

### 3.3 Plan de Adaptación de APIs

Seguir este orden (de menos a más crítico):

1. ✅ **Configuración** (`/api/config`)
2. ✅ **Clientes** (`/api/clientes`)
3. ✅ **Empleadas** (`/api/empleadas`)
4. ✅ **Servicios** (`/api/servicios`)
5. ✅ **Turnos** (`/api/turnos`) - CRÍTICO
6. ✅ **Pagos** (`/api/pagos`)
7. ✅ **Señas** (`/api/senas`)
8. ✅ **Productos/Insumos**
9. ✅ **Caja**
10. ✅ **Reportes**

---

## Fase 4: Testing (1-2 días)

### 4.1 Tests Manuales

Checklist:

- [ ] Login funciona
- [ ] Crear cliente
- [ ] Editar cliente
- [ ] Eliminar cliente
- [ ] Crear turno
- [ ] Editar turno
- [ ] Cancelar turno
- [ ] Marcar turno en curso
- [ ] Completar turno
- [ ] Registrar pago
- [ ] Aplicar seña
- [ ] Ver liquidación
- [ ] Movimientos de caja
- [ ] Stock de productos

### 4.2 Pruebas de Performance

```sql
-- Ver queries lentas
EXPLAIN ANALYZE
SELECT * FROM turnos
WHERE usuario_id = 'xxx'
  AND fecha_inicio >= NOW()
ORDER BY fecha_inicio;
```

### 4.3 Verificar Integridad de Datos

```sql
-- Turnos sin cliente (no debería haber)
SELECT COUNT(*) FROM turnos t
LEFT JOIN clientes c ON t.cliente_id = c.id
WHERE c.id IS NULL;

-- Pagos sin turno (no debería haber)
SELECT COUNT(*) FROM pagos p
LEFT JOIN turnos t ON p.turno_id = t.id
WHERE t.id IS NULL;
```

---

## Fase 5: Despliegue a Producción (1 día)

### 5.1 Pre-Despliegue

```bash
# Hacer backup final del JSON
cp .localdb.json .localdb.FINAL_BACKUP.json

# Hacer backup de PostgreSQL
pg_dump -U narella_user -d narella_db -F c -f narella_pre_deploy.dump
```

### 5.2 Desplegar

```bash
# 1. Subir código al VPS
git push origin main
# ssh al VPS y pull

# 2. Instalar dependencias
npm install --production

# 3. Build
npm run build

# 4. Reiniciar aplicación
pm2 restart narella-app
# o
systemctl restart narella-app
```

### 5.3 Post-Despliegue

```bash
# Verificar logs
pm2 logs narella-app

# Monitorear PostgreSQL
sudo -u postgres psql -d narella_db
```

```sql
-- Ver conexiones activas
SELECT count(*) FROM pg_stat_activity WHERE datname = 'narella_db';

-- Ver queries activas
SELECT * FROM pg_stat_activity WHERE datname = 'narella_db';
```

---

## Fase 6: Limpieza (después de 1 semana)

Solo después de estar seguro que todo funciona:

```bash
# Eliminar sistema antiguo
rm -rf lib/localdb/

# Mantener backup por 30 días
mv .localdb.FINAL_BACKUP.json backups/
```

---

## Rollback Plan (si algo sale mal)

### Opción 1: Volver a JSON

```bash
# 1. Revertir código
git revert HEAD

# 2. Restaurar .localdb.json
cp .localdb.FINAL_BACKUP.json .localdb.json

# 3. Redeploy
npm run build
pm2 restart narella-app
```

### Opción 2: Restaurar PostgreSQL

```bash
# Limpiar base de datos
sudo -u postgres psql -d narella_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restaurar desde backup
pg_restore -U narella_user -d narella_db -v narella_pre_deploy.dump
```

---

## Troubleshooting Común

### Error: "duplicate key value violates unique constraint"

**Causa:** Datos duplicados en el JSON original

**Solución:**
```typescript
// En el script de migración, usar:
ON CONFLICT (id) DO NOTHING
// o
ON CONFLICT (id) DO UPDATE SET ...
```

### Error: "relation does not exist"

**Causa:** Schema no importado correctamente

**Solución:**
```bash
sudo -u postgres psql -d narella_db -f database/schema.sql
```

### Error: "could not connect to server"

**Causa:** PostgreSQL no está corriendo o firewall bloqueando

**Solución:**
```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar firewall
sudo ufw status
```

### Performance lenta

**Solución:**
```sql
-- Reindexar
REINDEX DATABASE narella_db;

-- Actualizar estadísticas
VACUUM ANALYZE;
```

---

## Checklist Final

### ✅ Pre-Migración
- [ ] Backup completo del sistema actual
- [ ] PostgreSQL instalado y configurado
- [ ] Schema importado
- [ ] Conexión funcionando

### ✅ Migración
- [ ] Script de migración ejecutado sin errores
- [ ] Datos verificados en PostgreSQL
- [ ] Integridad referencial validada

### ✅ Código
- [ ] Todas las API routes adaptadas
- [ ] Autenticación funcionando
- [ ] Sesiones funcionando

### ✅ Testing
- [ ] Tests manuales completos
- [ ] Performance aceptable
- [ ] Sin errores en logs

### ✅ Producción
- [ ] Despliegue exitoso
- [ ] Monitoreo activo
- [ ] Backups automáticos configurados

---

## Recursos

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [node-postgres](https://node-postgres.com/)
- [Next.js Database Integration](https://nextjs.org/docs/app/building-your-application/data-fetching)
- `/database/README.md` - Instrucciones de instalación
- `/database/SCHEMA_DESIGN.md` - Documentación del schema

---

## Soporte

Si encontrás problemas durante la migración:

1. Revisar logs: `pm2 logs` y `/var/log/postgresql/`
2. Verificar integridad de datos con queries SQL
3. Consultar la documentación en `/database/`
4. Hacer rollback si es necesario (seguir Rollback Plan)
