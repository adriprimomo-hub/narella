# Diseño del Esquema de Base de Datos - Sistema Narella Turnos

## Resumen

Base de datos PostgreSQL para sistema de gestión de turnos de salón de belleza con:
- Gestión de turnos y citas
- Control de pagos y señas
- Liquidación de comisiones a empleadas
- Inventario de productos e insumos
- Movimientos de caja
- Confirmación de turnos por WhatsApp

---

## Decisiones de Diseño

### 1. Tipos de Datos

| Tipo PostgreSQL | Uso | Razón |
|-----------------|-----|-------|
| `UUID` | IDs primarias | Mejor para sistemas distribuidos, no predecibles |
| `TIMESTAMPTZ` | Fechas/horas | Incluye timezone, ideal para Argentina |
| `DECIMAL(10,2)` | Dinero | Precisión exacta para valores monetarios |
| `JSONB` | Datos flexibles | Mejor que JSON: indexable y más eficiente |
| `VARCHAR(n)` | Texto con límite | Validación y optimización de espacio |
| `TEXT` | Texto sin límite | Para notas, observaciones, etc. |

### 2. Normalización

**Nivel de normalización: 3NF (Tercera Forma Normal)**

✅ **Ventajas:**
- Evita redundancia de datos
- Facilita actualizaciones
- Integridad referencial garantizada

⚠️ **Desnormalización controlada:**
- `servicio_final_id` y `empleada_final_id` en `turnos`: permite tracking de cambios
- `monto_sena_aplicada` en `pagos`: cache para performance
- Campos JSON (`horarios`, `precios_por_metodo`): flexibilidad sin crear tablas extra

### 3. Índices Estratégicos

**Índices creados:**
1. **FK automáticas**: Todas las relaciones tienen índice
2. **Campos de búsqueda**: nombre, telefono, username
3. **Filtros comunes**: activo, estado, tipo
4. **Ordenamiento**: created_at, fecha_inicio
5. **Compuestos**: empleada + fechas (detección de solapamientos)
6. **Full-text**: búsqueda de clientes por nombre

**Performance esperada:**
- Búsquedas de turnos: < 10ms
- Listados filtrados: < 50ms
- Reportes de liquidación: < 200ms

### 4. Integridad Referencial

**Foreign Keys configuradas con:**
- `ON DELETE CASCADE`: Para datos dependientes (ej: clientes → turnos del usuario)
- `ON DELETE RESTRICT`: Para datos críticos (ej: empleada con turnos activos)
- `ON DELETE SET NULL`: Para referencias opcionales (ej: seña aplicada)

**Constraints:**
- Precios/montos ≥ 0
- Duraciones > 0
- fecha_fin > fecha_inicio
- Estados limitados con `CHECK`
- Stock no negativo

---

## Diagrama de Relaciones (ERD)

```
┌─────────────┐
│  USUARIOS   │ (tenant_id self-reference para multi-tenancy)
└─────┬───────┘
      │ 1:N
      ├────────────────────────────────────────────┐
      │                                            │
      ↓ 1:N                                        ↓ 1:N
┌─────────────┐                              ┌─────────────┐
│  CLIENTES   │                              │  EMPLEADAS  │
└─────┬───────┘                              └─────┬───────┘
      │ 1:N                                        │ 1:N
      │                                            │
      │         ┌──────────────────────────────────┤
      │         │                                  │
      │         ↓ 1:N                              │
      │   ┌─────────────┐                          │
      │   │   SENAS     │                          │
      │   └─────┬───────┘                          │
      │         │ 0:1                              │
      │         │                                  │
      │         │         ┌─────────────┐          │
      │         │         │  SERVICIOS  │          │
      │         │         └─────┬───────┘          │
      │         │               │ N:M              │
      │         │               │                  │
      │         │    ┌──────────┴──────────────────┤
      │         │    │                             │
      │         │    │  ┌─────────────────────────────┐
      │         │    │  │ SERVICIO_EMPLEADA_COMISIONES│
      │         │    │  └─────────────────────────────┘
      │         │    │
      │         ↓    ↓ servicio_id, servicio_final_id, empleada_id, empleada_final_id
      │      ┌─────────────┐
      └─────→│   TURNOS    │
             └─────┬───────┘
                   │ 1:N
        ┌──────────┼───────────┬──────────────┐
        │          │           │              │
        ↓ 1:N      ↓ 1:N       ↓ 1:N          ↓ 1:N
  ┌──────────┐ ┌─────────┐ ┌────────────┐ ┌─────────────────┐
  │  PAGOS   │ │TURNO_   │ │RECORDATO-  │ │ CONFIRMATION_   │
  │          │ │ADICIO-  │ │RIOS        │ │ TOKENS          │
  │          │ │NALES    │ └────────────┘ └─────────────────┘
  └──────────┘ └────┬────┘
                    │ N:1
                    ↓
              ┌────────────┐
              │ADICIONALES │
              └────────────┘

┌─────────────┐              ┌─────────────┐
│  PRODUCTOS  │              │   INSUMOS   │
└─────┬───────┘              └─────┬───────┘
      │ 1:N                        │ 1:N
      ↓                            ↓
┌──────────────────┐      ┌───────────────────┐
│PRODUCTO_         │      │INSUMO_            │
│MOVIMIENTOS       │      │MOVIMIENTOS        │
└──────────────────┘      └───────────────────┘

┌─────────────────────┐
│  CAJA_MOVIMIENTOS   │ (trazabilidad opcional a pagos/adelantos)
└─────────────────────┘

┌─────────────────────────┐
│ METODOS_PAGO_CONFIG     │ (configuración global)
└─────────────────────────┘

┌─────────────┐
│  ADELANTOS  │
└─────────────┘
```

---

## Tablas Principales

### 1. `usuarios`
**Propósito:** Usuarios del sistema con roles y pertenencia al tenant

**Campos clave:**
- `rol`: admin, recepcion, staff, caja, solo_turnos
- `tenant_id`: Para multi-tenancy (varios locales en una DB)
- La configuración del local (ej. horario de atención) vive en `configuracion`, no en `usuarios`

**Seguridad:**
- Password debe hashearse con bcrypt (min 10 rounds)
- `tenant_id` permite aislar datos entre locales

### 2. `turnos`
**Propósito:** Citas agendadas

**Campos importantes:**
- `servicio_id` vs `servicio_final_id`: Permite tracking de cambios
- `empleada_id` vs `empleada_final_id`: Permite reasignaciones
- `estado`: pendiente → en_curso → completado/cancelado
- `confirmacion_estado`: flujo de confirmación por WhatsApp
- `minutos_tarde`, `penalidad_monto`: para control de demoras

**Validaciones:**
- No solapamiento de turnos para misma empleada
- Turno dentro del horario laboral de la empleada
- Turno dentro del horario del local

### 3. `pagos`
**Propósito:** Registro de cobros de servicios

**Cálculo de monto:**
```sql
monto_base = servicio.precio
ajuste = aplicar_config_metodo_pago(metodo_pago, monto_base)
adicionales = SUM(cantidad * precio_unitario)
total = monto_base + ajuste + adicionales - sena_aplicada
```

**Flujo:**
1. Cliente tiene turno completado
2. Se registra pago con método
3. Se aplica seña si existe (seña.estado = 'aplicada')
4. Se registra movimiento en `caja_movimientos`

### 4. `senas`
**Propósito:** Anticipos de clientes

**Estados:**
- `pendiente`: Registrada pero no usada
- `aplicada`: Descontada de un pago
- `devuelta`: Reembolsada al cliente

**Importante:** Una seña puede aplicarse a múltiples pagos si el usuario elige "mantener seña disponible"

### 5. `productos` e `insumos`
**Propósito:** Inventario de venta y consumibles

**Diferencias:**
| Productos | Insumos |
|-----------|---------|
| Para venta a clientes | Para uso interno |
| Stock en unidades enteras | Stock en decimales (litros, kg) |
| Precio de venta | Sin precio de venta |
| Movimientos: compra/venta/ajuste | Movimientos: compra/entrega/ajuste |

**Control de stock:**
```sql
stock_nuevo = stock_actual + (signo * cantidad)
-- signo: compra/ajuste_positivo = +1
--        venta/ajuste_negativo/entrega = -1
```

### 6. `caja_movimientos`
**Propósito:** Registro contable de ingresos/egresos

**Trazabilidad:**
- `source_tipo` + `source_id`: Permite saber origen del movimiento
- Ejemplos: turno_pago, adelanto, manual, gasto_general

**Reportes:**
- Resumen por método de pago
- Balance diario/mensual
- Arqueo de caja

---

## Campos JSON (JSONB)

### `configuracion.horario_local`
```json
[
  { "dia": 0, "desde": "", "hasta": "", "activo": false },
  { "dia": 1, "desde": "09:00", "hasta": "19:00", "activo": true },
  { "dia": 2, "desde": "09:00", "hasta": "19:00", "activo": true },
  ...
]
```
- `dia`: 0=Domingo, 1=Lunes, ..., 6=Sábado
- Formato hora: "HH:mm" (24hs)

### `empleadas.horarios`
```json
[
  { "dia": 1, "desde": "09:00", "hasta": "17:00" },
  { "dia": 2, "desde": "09:00", "hasta": "17:00" },
  ...
]
```

### `servicios.precios_por_metodo`
```json
{
  "efectivo": 1200,
  "tarjeta": 1260,
  "transferencia": 1200
}
```

### `servicios.empleadas_habilitadas`
```json
["uuid-empleada-1", "uuid-empleada-2"]
```

### `pagos.detalle_adicionales`
```json
[
  {
    "adicional_id": "uuid-adicional",
    "cantidad": 2,
    "precio_unitario": 500
  }
]
```

---

## Vistas Útiles

### `v_turnos_completos`
Turnos con todos los datos relacionados expandidos (cliente, empleada, servicio)

**Uso:** Dashboard, listados, reportes

### `v_productos_stock_bajo` / `v_insumos_stock_bajo`
Productos/insumos por debajo del stock mínimo

**Uso:** Alertas de reabastecimiento

### `v_caja_resumen`
Resumen de ingresos/egresos por método de pago

**Uso:** Arqueo de caja, reportes financieros

---

## Funciones Útiles

### `calcular_comision_turno(servicio_id, empleada_id, monto)`
Calcula la comisión de una empleada para un turno.

**Lógica:**
1. Buscar comisión específica en `servicio_empleada_comisiones`
2. Si no existe, usar comisión del `servicios`
3. Aplicar: `(monto * pct / 100) + monto_fijo`

**Uso en liquidaciones:**
```sql
SELECT
  t.empleada_final_id,
  SUM(calcular_comision_turno(t.servicio_final_id, t.empleada_final_id, p.monto)) as total_comisiones
FROM turnos t
JOIN pagos p ON t.id = p.turno_id
WHERE t.estado = 'completado'
  AND t.fecha_inicio >= '2026-01-01'
GROUP BY t.empleada_final_id;
```

---

## Triggers

### `update_updated_at_column()`
Actualiza automáticamente el campo `updated_at` en cada UPDATE.

**Tablas afectadas:**
- usuarios, clientes, empleadas, servicios, turnos, adicionales, senas, productos, insumos

---

## Seguridad

### Row Level Security (RLS)
El schema incluye comentarios para habilitar RLS por tenant.

**Configuración recomendada:**
```sql
-- En la conexión, setear el tenant actual:
SET app.current_tenant_id = 'uuid-del-tenant';

-- Política RLS:
CREATE POLICY tenant_isolation ON tabla
  USING (usuario_id = current_setting('app.current_tenant_id')::uuid);
```

### Control de Acceso por Rol

| Rol | Permisos |
|-----|----------|
| `admin` | Acceso total, ver comisiones, modificar precios, ver costos |
| `recepcion` | Gestión de turnos, clientes, pagos (sin comisiones ni costos) |
| `staff` | Ver turnos propios, marcar asistencias |
| `caja` | Pagos, movimientos de caja |
| `solo_turnos` | Solo lectura de turnos |

**Implementar a nivel de aplicación:**
- Next.js middleware verifica rol
- API routes filtran datos según permisos

---

## Migraciones y Versionado

### Estrategia Recomendada

1. **Herramienta:** Prisma Migrate o node-pg-migrate
2. **Archivos:** `migrations/001_initial_schema.sql`, `002_add_field.sql`, etc.
3. **Control:** Tabla `schema_migrations` con versión actual

### Backup Automático

```bash
#!/bin/bash
# Backup diario
FECHA=$(date +%Y%m%d_%H%M%S)
pg_dump -U narella_user -d narella_db -F c -b -v -f "/backups/narella_$FECHA.dump"

# Retener últimos 30 días
find /backups -name "narella_*.dump" -mtime +30 -delete
```

---

## Optimizaciones de Performance

### Configuración PostgreSQL Recomendada (VPS 1-2GB)

```conf
# postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1  # Para SSD
effective_io_concurrency = 200
work_mem = 4MB
max_connections = 50
```

### Vacuum y Análisis

```sql
-- Configurar autovacuum (ya viene por defecto, pero verificar):
ALTER TABLE turnos SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE pagos SET (autovacuum_analyze_scale_factor = 0.05);

-- Vacuum manual periódico:
VACUUM ANALYZE;
```

### Particionamiento (Futuro)

Si la tabla `turnos` crece > 10M registros:
```sql
-- Particionar por año
CREATE TABLE turnos_2026 PARTITION OF turnos
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

---

## Consultas Comunes

### Turnos del día de una empleada
```sql
SELECT *
FROM v_turnos_completos
WHERE empleada_final_id = $1
  AND fecha_inicio::date = CURRENT_DATE
ORDER BY fecha_inicio;
```

### Liquidación mensual de una empleada
```sql
SELECT
  e.nombre,
  COUNT(t.id) as cantidad_turnos,
  SUM(calcular_comision_turno(t.servicio_final_id, t.empleada_final_id, p.monto)) as total_comisiones,
  COALESCE(SUM(a.monto), 0) as total_adelantos,
  SUM(calcular_comision_turno(t.servicio_final_id, t.empleada_final_id, p.monto)) - COALESCE(SUM(a.monto), 0) as neto_a_pagar
FROM empleadas e
LEFT JOIN turnos t ON e.id = t.empleada_final_id
  AND t.estado = 'completado'
  AND DATE_TRUNC('month', t.fecha_inicio) = DATE_TRUNC('month', CURRENT_DATE)
LEFT JOIN pagos p ON t.id = p.turno_id
LEFT JOIN adelantos a ON e.id = a.empleada_id
  AND DATE_TRUNC('month', a.fecha_entrega) = DATE_TRUNC('month', CURRENT_DATE)
WHERE e.id = $1
GROUP BY e.id, e.nombre;
```

### Reporte de caja del día
```sql
SELECT
  medio_pago,
  SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) as ingresos,
  SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) as egresos,
  SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) as saldo
FROM caja_movimientos
WHERE created_at::date = CURRENT_DATE
  AND usuario_id = $1
GROUP BY medio_pago;
```

### Turnos sin confirmar próximos 24hs
```sql
SELECT *
FROM v_turnos_completos
WHERE confirmacion_estado IN ('no_enviada', 'enviada')
  AND estado = 'pendiente'
  AND fecha_inicio BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
  AND usuario_id = $1
ORDER BY fecha_inicio;
```

---

## Próximos Pasos

### 1. Migración desde JSON
```typescript
// Script de migración
import { db as localDb } from './lib/localdb/store'
import { pool } from './lib/db/postgres'

// Para cada tabla:
// 1. Mapear tipos (string ISO → timestamptz)
// 2. Insertar con pg.query()
// 3. Validar constraints
```

### 2. ORM o Query Builder

**Opciones:**
- **Prisma**: Type-safe, migraciones automáticas
- **Drizzle**: Más ligero, mejor para Next.js
- **node-postgres (pg)**: Queries manuales, máximo control

**Recomendación:** Drizzle por performance y DX

### 3. Variables de Entorno
```env
DATABASE_URL=postgresql://usuario:password@localhost:5432/narella_db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

---

## Soporte y Mantenimiento

### Monitoreo
```sql
-- Queries lentas
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Tamaño de tablas
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Conexiones activas
SELECT count(*) FROM pg_stat_activity;
```

### Logs
```sql
-- Habilitar log de queries lentas
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 segundo
SELECT pg_reload_conf();
```

---

## Referencias

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JSONB Performance](https://www.postgresql.org/docs/current/datatype-json.html)
- [Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
