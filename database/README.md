# Base de Datos - Sistema Narella Turnos

Este directorio contiene todo lo necesario para configurar y gestionar la base de datos PostgreSQL del sistema.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `schema.sql` | Schema completo de la base de datos (tablas, índices, triggers, vistas) |
| `seed.sql` | Datos de ejemplo para desarrollo y testing |
| `SCHEMA_DESIGN.md` | Documentación detallada del diseño y decisiones |
| `README.md` | Este archivo - instrucciones de uso |

---

## Instalación en VPS DonWeb

### 1. Conectar al VPS por SSH

```bash
ssh usuario@tu-vps.donweb.com
```

### 2. Instalar PostgreSQL

```bash
# Actualizar paquetes
sudo apt update

# Instalar PostgreSQL 15
sudo apt install postgresql postgresql-contrib -y

# Verificar instalación
psql --version
```

### 3. Configurar PostgreSQL

```bash
# Cambiar a usuario postgres
sudo -u postgres psql

# Dentro de PostgreSQL:
```

```sql
-- Crear base de datos
CREATE DATABASE narella_db;

-- Crear usuario
CREATE USER narella_user WITH ENCRYPTED PASSWORD 'TU_PASSWORD_SEGURO_AQUI';

-- Dar permisos
GRANT ALL PRIVILEGES ON DATABASE narella_db TO narella_user;

-- Conectar a la base de datos
\c narella_db

-- Dar permisos en el schema público
GRANT ALL ON SCHEMA public TO narella_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO narella_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO narella_user;

-- Salir
\q
```

### 4. Configurar acceso remoto (opcional)

Si necesitas conectarte desde tu máquina local:

```bash
# Editar postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Buscar y modificar:
listen_addresses = '*'  # o 'localhost,tu_ip_local'

# Editar pg_hba.conf
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Agregar al final:
# host    narella_db    narella_user    0.0.0.0/0    scram-sha-256

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

**Importante:** Asegurate de configurar el firewall para permitir el puerto 5432 solo desde IPs confiables.

### 5. Importar el Schema

```bash
# Copiar schema.sql al servidor (desde tu máquina local)
scp database/schema.sql usuario@tu-vps.donweb.com:/tmp/

# En el VPS, importar el schema
sudo -u postgres psql -d narella_db -f /tmp/schema.sql
```

### 6. Importar datos de ejemplo (opcional)

```bash
# Copiar seed.sql al servidor
scp database/seed.sql usuario@tu-vps.donweb.com:/tmp/

# Importar datos
sudo -u postgres psql -d narella_db -f /tmp/seed.sql
```

---

## Configuración de la Aplicación Next.js

### 1. Instalar dependencias

```bash
npm install pg
# O si usas un ORM:
npm install drizzle-orm
# O
npm install prisma @prisma/client
```

### 2. Variables de entorno

Crear archivo `.env.local` en la raíz del proyecto:

```env
# PostgreSQL Connection
DATABASE_URL="postgresql://narella_user:TU_PASSWORD@localhost:5432/narella_db"

# Pool settings (opcional)
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

**Para producción en el VPS**, reemplazar `localhost` por la IP del servidor o `127.0.0.1` si la app está en el mismo servidor.

### 3. Crear cliente de base de datos

Opción A: **node-postgres (pg)** - Queries manuales

```typescript
// lib/db/postgres.ts
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Ejemplo de uso
export async function query(text: string, params?: any[]) {
  const start = Date.now()
  const res = await pool.query(text, params)
  const duration = Date.now() - start
  console.log('Query executed', { text, duration, rows: res.rowCount })
  return res
}
```

Opción B: **Drizzle ORM** - Type-safe (Recomendado)

```bash
npm install drizzle-orm
npm install -D drizzle-kit
```

```typescript
// lib/db/drizzle.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })
```

### 4. Migrar código desde localdb

Reemplazar las importaciones de `lib/localdb` con queries SQL:

**Antes:**
```typescript
import { db } from '@/lib/localdb/store'
const clientes = db.clientes.filter(c => c.usuario_id === userId)
```

**Después (con pg):**
```typescript
import { query } from '@/lib/db/postgres'
const result = await query('SELECT * FROM clientes WHERE usuario_id = $1', [userId])
const clientes = result.rows
```

**Después (con Drizzle):**
```typescript
import { db } from '@/lib/db/drizzle'
import { clientes } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const clientesResult = await db.select().from(clientes).where(eq(clientes.usuario_id, userId))
```

---

## Comandos Útiles

### Backup de la base de datos

```bash
# Backup completo
pg_dump -U narella_user -d narella_db -F c -b -v -f "narella_backup_$(date +%Y%m%d_%H%M%S).dump"

# Backup solo datos (sin schema)
pg_dump -U narella_user -d narella_db --data-only -F c -f "narella_data_$(date +%Y%m%d).dump"

# Backup solo schema
pg_dump -U narella_user -d narella_db --schema-only -F p -f "narella_schema.sql"
```

### Restaurar backup

```bash
# Restaurar desde dump binario
pg_restore -U narella_user -d narella_db -v "narella_backup_20260126.dump"

# Restaurar desde SQL
psql -U narella_user -d narella_db -f "narella_schema.sql"
```

### Backup automático (cron)

```bash
# Editar crontab
crontab -e

# Agregar línea para backup diario a las 3 AM
0 3 * * * pg_dump -U narella_user -d narella_db -F c -b -f "/backups/narella_$(date +\%Y\%m\%d).dump" && find /backups -name "narella_*.dump" -mtime +30 -delete
```

### Ver estado de la base de datos

```bash
# Conectarse
sudo -u postgres psql -d narella_db
```

```sql
-- Ver tamaño de tablas
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Ver cantidad de registros
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Ver queries lentas
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Ver conexiones activas
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query
FROM pg_stat_activity
WHERE datname = 'narella_db';
```

### Mantenimiento

```bash
# Conectarse
sudo -u postgres psql -d narella_db
```

```sql
-- Vacuum (limpieza y optimización)
VACUUM ANALYZE;

-- Reindexar (si hay degradación de performance)
REINDEX DATABASE narella_db;

-- Ver índices no utilizados
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;
```

---

## Troubleshooting

### Error: "role does not exist"

```sql
-- Crear el rol faltante
CREATE USER narella_user WITH PASSWORD 'password';
```

### Error: "permission denied for schema public"

```sql
-- Dar permisos
GRANT ALL ON SCHEMA public TO narella_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO narella_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO narella_user;
```

### Error: "too many connections"

```bash
# Editar postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Aumentar max_connections (default 100)
max_connections = 200

# Reiniciar
sudo systemctl restart postgresql
```

### Error: "out of memory"

Para VPS con 1-2 GB RAM, ajustar `shared_buffers`:

```bash
# Editar postgresql.conf
sudo nano /etc/postgresql/15/main/postgresql.conf

# Reducir shared_buffers
shared_buffers = 128MB  # En vez de 256MB

# Reiniciar
sudo systemctl restart postgresql
```

### Ver logs de PostgreSQL

```bash
# Ver últimas líneas del log
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## Migraciones

Para cambios futuros en el schema, usar herramientas de migración:

### Con node-pg-migrate

```bash
npm install node-pg-migrate

# Crear migración
npx node-pg-migrate create add-campo-ejemplo

# Correr migraciones
npx node-pg-migrate up

# Rollback
npx node-pg-migrate down
```

### Con Drizzle Kit

```bash
npm install -D drizzle-kit

# Generar migración desde schema
npx drizzle-kit generate:pg

# Aplicar migración
npx drizzle-kit push:pg
```

---

## Seguridad

### Configuración recomendada para producción

1. **Usar contraseñas fuertes:**
   ```bash
   # Generar password seguro
   openssl rand -base64 32
   ```

2. **Limitar conexiones por IP:**
   ```bash
   # Editar pg_hba.conf
   sudo nano /etc/postgresql/15/main/pg_hba.conf

   # Solo permitir desde IPs específicas
   host    narella_db    narella_user    192.168.1.100/32    scram-sha-256
   ```

3. **SSL/TLS:**
   ```bash
   # En postgresql.conf
   ssl = on
   ssl_cert_file = '/path/to/server.crt'
   ssl_key_file = '/path/to/server.key'
   ```

4. **Variables de entorno seguras:**
   - NUNCA commitear `.env` al repositorio
   - Usar secrets management en producción
   - Rotar passwords periódicamente

5. **Firewall:**
   ```bash
   # Solo permitir puerto 5432 desde la IP de la app
   sudo ufw allow from IP_DE_TU_APP to any port 5432
   ```

---

## Monitoreo

### Configurar pgAdmin (GUI)

1. Descargar desde: https://www.pgadmin.org/
2. Agregar servidor:
   - Host: IP de tu VPS
   - Port: 5432
   - Database: narella_db
   - Username: narella_user
   - Password: tu_password

### Monitoreo con pg_stat_statements

```sql
-- Habilitar extensión
CREATE EXTENSION pg_stat_statements;

-- Ver queries más lentas
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

---

## Recursos Adicionales

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [node-postgres (pg)](https://node-postgres.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Prisma](https://www.prisma.io/)
- [DonWeb Documentación VPS](https://donweb.com/es-ar/ayuda/vps)

---

## Soporte

Para problemas específicos de DonWeb:
- Soporte técnico: https://donweb.com/es-ar/ayuda
- Panel de control: https://clientes.donweb.com

Para problemas de PostgreSQL:
- Comunidad: https://www.postgresql.org/community/
- Stack Overflow: tag `postgresql`
