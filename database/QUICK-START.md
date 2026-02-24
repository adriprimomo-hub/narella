# 🚀 Quick Start - PostgreSQL para Narella

**Guía de inicio rápido de 5 minutos**

---

## ⚡ Instalación Rápida (VPS DonWeb)

### Opción 1: Script Automático (RECOMENDADO)

```bash
# Clonar/copiar proyecto al VPS
cd narellaturnos

# Ejecutar setup automático
sudo chmod +x scripts/setup-postgres.sh
sudo ./scripts/setup-postgres.sh

# ✓ Listo! PostgreSQL configurado
```

### Opción 2: Manual (3 comandos)

```bash
# 1. Instalar PostgreSQL
sudo apt update && sudo apt install postgresql -y

# 2. Crear base de datos
sudo -u postgres psql -c "CREATE DATABASE narella_db;"
sudo -u postgres psql -c "CREATE USER narella_user WITH PASSWORD 'tu_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE narella_db TO narella_user;"

# 3. Importar schema
sudo -u postgres psql -d narella_db -f database/schema.sql
```

---

## 📝 Configurar tu App Next.js

### 1. Variables de entorno

```bash
# .env.local (desarrollo)
DATABASE_URL="postgresql://narella_user:password@localhost:5432/narella_db"

# .env.production (producción)
DATABASE_URL="postgresql://narella_user:password@IP_VPS:5432/narella_db"
```

### 2. Instalar dependencias

```bash
npm install pg
```

### 3. Crear cliente de DB

```typescript
// lib/db/postgres.ts
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params)
  return res
}
```

### 4. Usar en API Routes

```typescript
// app/api/clientes/route.ts
import { query } from '@/lib/db/postgres'

export async function GET() {
  const result = await query('SELECT * FROM clientes WHERE usuario_id = $1', [userId])
  return Response.json(result.rows)
}
```

---

## 🔄 Migrar tus Datos Actuales

```bash
# Hacer backup del JSON actual
cp .localdb.json .localdb.backup.json

# Configurar conexión
export DATABASE_URL="postgresql://user:pass@host:5432/narella_db"

# Ejecutar migración
npx tsx scripts/migrate-to-postgres.ts

# Verificar que todo migró bien
# (el script muestra un resumen)
```

---

## 💾 Comandos Útiles

### Conectarse a la DB

```bash
# Localmente
psql -U narella_user -d narella_db

# Desde otro servidor
psql -h IP_VPS -U narella_user -d narella_db
```

### Queries comunes

```sql
-- Ver todas las tablas
\dt

-- Ver estructura de una tabla
\d turnos

-- Ver tamaño de tablas
SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Contar registros
SELECT 'clientes' as tabla, COUNT(*) FROM clientes
UNION ALL SELECT 'turnos', COUNT(*) FROM turnos;

-- Ver conexiones activas
SELECT * FROM pg_stat_activity WHERE datname = 'narella_db';
```

### Backup y Restore

```bash
# Backup
pg_dump -U narella_user -d narella_db -F c -f backup.dump

# Restore
pg_restore -U narella_user -d narella_db -c backup.dump

# Backup automático (configurar cron)
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh
```

---

## 🔍 Queries de Ejemplo para tu App

### Obtener turnos del día

```typescript
const result = await query(`
  SELECT t.*, c.nombre, c.apellido, e.nombre as empleada_nombre
  FROM turnos t
  LEFT JOIN clientes c ON t.cliente_id = c.id
  LEFT JOIN empleadas e ON t.empleada_final_id = e.id
  WHERE t.usuario_id = $1
    AND t.fecha_inicio::date = CURRENT_DATE
  ORDER BY t.fecha_inicio
`, [userId])
```

### Crear nuevo turno

```typescript
const result = await query(`
  INSERT INTO turnos (
    usuario_id, cliente_id, servicio_id, servicio_final_id,
    empleada_id, empleada_final_id, fecha_inicio, fecha_fin,
    duracion_minutos, estado, creado_por, creado_por_username
  )
  VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $7, 'pendiente', $1, $8)
  RETURNING *
`, [
  userId, clienteId, servicioId, empleadaId,
  fechaInicio, fechaFin, duracionMinutos, username
])
```

### Registrar pago (con transacción)

```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // 1. Crear pago
  const pago = await client.query(`
    INSERT INTO pagos (usuario_id, turno_id, monto, metodo_pago, fecha_pago, creado_por_username)
    VALUES ($1, $2, $3, $4, NOW(), $5)
    RETURNING *
  `, [userId, turnoId, monto, metodoPago, username])

  // 2. Actualizar turno
  await client.query(`
    UPDATE turnos SET estado = 'completado', finalizado_en = NOW()
    WHERE id = $1
  `, [turnoId])

  // 3. Registrar en caja
  await client.query(`
    INSERT INTO caja_movimientos (usuario_id, medio_pago, tipo, monto, motivo, creado_por, creado_por_username)
    VALUES ($1, $2, 'ingreso', $3, 'Pago de turno', $1, $4)
  `, [userId, metodoPago, monto, username])

  await client.query('COMMIT')
  return pago.rows[0]
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  client.release()
}
```

### Liquidación mensual de empleada

```typescript
const result = await query(`
  SELECT
    COUNT(t.id) as cantidad_turnos,
    SUM(calcular_comision_turno(t.servicio_final_id, t.empleada_final_id, p.monto)) as total_comisiones
  FROM turnos t
  LEFT JOIN pagos p ON t.id = p.turno_id
  WHERE t.empleada_final_id = $1
    AND t.estado = 'completado'
    AND DATE_TRUNC('month', t.fecha_inicio) = DATE_TRUNC('month', $2::date)
`, [empleadaId, fecha])
```

---

## 🐛 Troubleshooting Rápido

### Error: "could not connect to server"

```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Iniciarlo si está parado
sudo systemctl start postgresql
```

### Error: "role does not exist"

```bash
# Crear el rol faltante
sudo -u postgres psql -c "CREATE USER narella_user WITH PASSWORD 'password';"
```

### Error: "permission denied"

```bash
# Dar permisos
sudo -u postgres psql -d narella_db
GRANT ALL ON SCHEMA public TO narella_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO narella_user;
```

### Error: "too many connections"

```bash
# Ver conexiones activas
psql -U narella_user -d narella_db -c "SELECT COUNT(*) FROM pg_stat_activity;"

# Cerrar conexiones inactivas
# En tu app: siempre usar pool.end() al terminar
```

### Queries lentas

```sql
-- Ver queries lentas
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Reindexar si es necesario
REINDEX DATABASE narella_db;
```

---

## 📚 Documentación Completa

- **`RESUMEN.md`** - Resumen ejecutivo y decisiones
- **`README.md`** - Instalación completa y comandos
- **`SCHEMA_DESIGN.md`** - Documentación técnica detallada
- **`migration-guide.md`** - Guía de migración paso a paso
- **`example-client.ts`** - Ejemplos de código completos
- **`CHANGELOG.md`** - Historial y características

---

## ⚙️ Configuración de Producción

### 1. Seguridad

```bash
# Firewall: permitir solo desde IP de la app
sudo ufw allow from IP_APP to any port 5432

# Cambiar password default
sudo -u postgres psql
ALTER USER narella_user WITH PASSWORD 'nuevo_password_seguro';
```

### 2. Backups automáticos

```bash
# Configurar backup diario
chmod +x scripts/backup-postgres.sh

# Agregar a crontab (3 AM diario)
crontab -e
# Agregar: 0 3 * * * /ruta/scripts/backup-postgres.sh
```

### 3. Monitoreo

```bash
# Ver tamaño de DB
psql -U narella_user -d narella_db -c "SELECT pg_size_pretty(pg_database_size('narella_db'));"

# Ver tablas más grandes
psql -U narella_user -d narella_db -c "
  SELECT tablename, pg_size_pretty(pg_total_relation_size('public.'||tablename))
  FROM pg_tables WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size('public.'||tablename) DESC;
"
```

### 4. Optimización para VPS básico

```bash
# Editar postgresql.conf
sudo nano /etc/postgresql/*/main/postgresql.conf

# Ajustar para 1-2 GB RAM:
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
max_connections = 50

# Reiniciar
sudo systemctl restart postgresql
```

---

## 🎯 Checklist de Implementación

### Fase 1: Setup Inicial

- [ ] PostgreSQL instalado en VPS
- [ ] Base de datos y usuario creados
- [ ] Schema importado correctamente
- [ ] Conexión desde app funcionando
- [ ] Variables de entorno configuradas

### Fase 2: Migración de Datos

- [ ] Backup del sistema actual
- [ ] Script de migración ejecutado
- [ ] Datos verificados en PostgreSQL
- [ ] Integridad referencial validada

### Fase 3: Código

- [ ] Cliente de DB creado (lib/db/postgres.ts)
- [ ] API routes adaptadas
- [ ] Queries probadas
- [ ] Transacciones funcionando

### Fase 4: Producción

- [ ] Backups automáticos configurados
- [ ] Firewall configurado
- [ ] Monitoreo activo
- [ ] SSL/TLS configurado (opcional)
- [ ] Documentación actualizada

---

## 💡 Tips Rápidos

### Performance

- Usa índices: Ya están creados en el schema ✅
- Usa prepared statements: Siempre con `$1, $2` ✅
- Usa pool de conexiones: No crear nuevas conexiones cada vez ✅
- Usa transacciones: Para operaciones relacionadas ✅

### Seguridad

- Variables de entorno: Nunca commitear passwords ✅
- Prepared statements: Previene SQL injection ✅
- Permisos mínimos: Solo lo necesario por usuario ✅
- Backups regulares: Configurar cron ✅

### Mantenimiento

- Vacuum: PostgreSQL lo hace automáticamente ✅
- Monitoreo: Revisar logs ocasionalmente ⚠️
- Updates: Actualizar PostgreSQL 1-2 veces/año ⚠️

---

## 🆘 Ayuda Rápida

### Necesitas...

**Ver ejemplos de código** → `database/example-client.ts`

**Instalar paso a paso** → `database/README.md`

**Entender el diseño** → `database/SCHEMA_DESIGN.md`

**Migrar desde JSON** → `database/migration-guide.md`

**Resolver problemas** → `database/README.md` (sección Troubleshooting)

**Ejecutar queries** → Esta página, sección "Queries de Ejemplo"

---

## ✅ Todo Listo

Si completaste los pasos arriba, ya tenés:

✅ PostgreSQL instalado y configurado
✅ Schema importado
✅ Datos migrados
✅ App conectada a la DB
✅ Backups configurados

**¡Ahora podés empezar a usar tu sistema con PostgreSQL! 🎉**

---

**¿Dudas?** Consulta la documentación completa en la carpeta `/database/`
