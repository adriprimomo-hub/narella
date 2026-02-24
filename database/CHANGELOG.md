# Changelog - PostgreSQL Database Schema

## [1.0.0] - 2026-01-27

### 🎉 Versión Inicial Completa

Esquema PostgreSQL completo para Sistema de Gestión de Turnos Narella.

---

## 📦 Archivos Creados

### Documentación Principal

- **`RESUMEN.md`** ⭐ EMPEZAR AQUÍ
  - Resumen ejecutivo
  - Comparación de bases de datos
  - Decisión recomendada: PostgreSQL
  - 3 pasos simples de implementación
  - FAQ y recursos

- **`README.md`**
  - Instrucciones detalladas de instalación
  - Configuración para VPS DonWeb
  - Comandos útiles
  - Troubleshooting completo
  - Guía de mantenimiento

- **`SCHEMA_DESIGN.md`**
  - Documentación técnica completa
  - Diseño de 19 tablas
  - Decisiones de arquitectura
  - Relaciones y constraints
  - Queries comunes
  - Optimizaciones de performance

- **`migration-guide.md`**
  - Guía de migración paso a paso
  - 6 fases con checklist
  - Plan de rollback
  - Troubleshooting de migración

### SQL y Schema

- **`schema.sql`** (1000+ líneas)
  - 19 tablas principales
  - Índices optimizados
  - Foreign keys configuradas
  - Triggers para updated_at
  - Vistas útiles (v_turnos_completos, v_caja_resumen)
  - Función calcular_comision_turno()
  - Extensión uuid-ossp
  - Comentarios en todas las tablas

- **`seed.sql`** (500+ líneas)
  - Datos de ejemplo para desarrollo
  - Usuarios con passwords hasheados
  - Clientes de ejemplo
  - Empleadas con horarios
  - Servicios variados
  - Turnos en diferentes estados
  - Pagos, señas, adelantos
  - Productos e insumos
  - Movimientos de caja

### Código y Ejemplos

- **`example-client.ts`**
  - Cliente PostgreSQL con node-postgres (pg)
  - Pool de conexiones configurado
  - 10+ ejemplos de queries
  - Funciones CRUD completas
  - Transacciones
  - JOINs complejos
  - Búsquedas y filtros
  - Integración con Next.js API routes

### Scripts de Automatización

- **`scripts/migrate-to-postgres.ts`**
  - Script ejecutable de migración
  - Migra datos de JSON a PostgreSQL
  - Modo dry-run para testing
  - Hasheo de passwords con bcrypt
  - Manejo de errores y duplicados
  - Reporte detallado de migración
  - Verificación de integridad

- **`scripts/backup-postgres.sh`**
  - Backup automático de PostgreSQL
  - Formato comprimido (pg_dump custom)
  - Retención de 30 días
  - Backup de schema y datos por separado
  - Estadísticas de base de datos
  - Limpieza automática de backups antiguos
  - Logs de ejecución

- **`scripts/setup-postgres.sh`**
  - Setup automático completo
  - Instalación de PostgreSQL
  - Creación de DB y usuario
  - Generación de passwords seguros
  - Import de schema
  - Configuración de acceso remoto (opcional)
  - Setup de backups automáticos
  - Generación de archivo .env
  - Verificación de instalación

---

## 🏗️ Estructura de Tablas

### Tablas Core (4)
- `usuarios` - Usuarios del sistema con roles
- `clientes` - Clientes del salón
- `empleadas` - Profesionales/empleadas
- `servicios` - Servicios ofrecidos

### Tablas de Operaciones (4)
- `turnos` - Citas/turnos agendados ⭐
- `pagos` - Pagos de servicios
- `senas` - Anticipos de clientes
- `adicionales` - Servicios adicionales

### Tablas de Inventario (4)
- `productos` - Productos para venta
- `insumos` - Materiales consumibles
- `producto_movimientos` - Historial productos
- `insumo_movimientos` - Historial insumos

### Tablas Financieras (3)
- `caja_movimientos` - Ingresos/egresos
- `adelantos` - Adelantos a empleadas
- `metodos_pago_config` - Config métodos de pago

### Tablas del Sistema (4)
- `confirmation_tokens` - Tokens WhatsApp
- `recordatorios` - Cola de recordatorios
- `turno_adicionales` - Relación turnos-adicionales
- `servicio_empleada_comisiones` - Comisiones específicas

**Total: 19 tablas**

---

## ✨ Características del Schema

### Normalización y Diseño
- ✅ Tercera forma normal (3NF)
- ✅ Integridad referencial completa
- ✅ Desnormalización controlada donde conviene
- ✅ Campos JSON (JSONB) para datos flexibles
- ✅ Multi-tenancy con usuario_id/tenant_id

### Performance
- ✅ 40+ índices estratégicos
- ✅ Índices en FK automáticos
- ✅ Índices compuestos para queries comunes
- ✅ Full-text search en clientes
- ✅ Vistas materializadas preparadas

### Seguridad
- ✅ Foreign keys con DELETE CASCADE/RESTRICT
- ✅ CHECK constraints en precios, estados
- ✅ Prepared statements (previene SQL injection)
- ✅ Soporte para Row Level Security (RLS)
- ✅ Passwords hasheados (bcrypt)

### Auditoría
- ✅ created_at/updated_at en todas las tablas
- ✅ creado_por/creado_por_username
- ✅ Triggers automáticos para updated_at
- ✅ Tracking de cambios (iniciado_por, cerrado_por)
- ✅ Timestamps completos (iniciado_en, finalizado_en)

### Funcionalidades Avanzadas
- ✅ Función calcular_comision_turno()
- ✅ Vista v_turnos_completos
- ✅ Vista v_productos_stock_bajo
- ✅ Vista v_insumos_stock_bajo
- ✅ Vista v_caja_resumen

---

## 📊 Métricas y Capacidad

### Performance Esperada (VPS 1-2 GB)
| Operación | Tiempo |
|-----------|--------|
| Login | < 100ms |
| Listar turnos | < 20ms |
| Crear turno | < 30ms |
| Registrar pago | < 50ms |
| Liquidación mensual | < 200ms |

### Capacidad
- Usuarios simultáneos: 10-20
- Turnos/día: Cientos sin degradación
- Datos históricos: Años sin problemas
- Tamaño estimado: ~50-100 MB/año

### Requisitos Mínimos
- **RAM**: 1 GB (2 GB recomendado)
- **Disco**: 10 GB disponibles
- **CPU**: 1 vCPU
- **Red**: 100 Mbps

---

## 🔧 Configuraciones Incluidas

### PostgreSQL (postgresql.conf)
```conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 4MB
max_connections = 50
```

### Backup Automático
- Frecuencia: Diaria (3 AM)
- Retención: 30 días
- Formato: Custom compressed
- Incluye: Schema + Datos

### Logs
- Queries lentas: > 1 segundo
- Conexiones: Monitoreadas
- Errores: Logged automáticamente

---

## 🚀 Próximos Pasos

### Para Desarrollo Local
1. Instalar PostgreSQL localmente
2. Importar schema.sql
3. Importar seed.sql (datos de ejemplo)
4. Configurar DATABASE_URL en .env.local
5. Probar con la app

### Para Producción (VPS DonWeb)
1. Ejecutar `scripts/setup-postgres.sh`
2. Migrar datos con `scripts/migrate-to-postgres.ts`
3. Configurar backups automáticos
4. Desplegar aplicación Next.js
5. Monitorear logs

---

## 📝 Notas de Versión

### Decisiones de Diseño Importantes

1. **UUIDs en vez de integers**
   - Mejor para sistemas distribuidos
   - No predecibles (seguridad)
   - Fácil merge de datos

2. **TIMESTAMPTZ en vez de TIMESTAMP**
   - Incluye zona horaria
   - Importante para Argentina (UTC-3)
   - Evita problemas de DST

3. **JSONB en vez de JSON**
   - Indexable
   - Más eficiente
   - Usado para horarios, precios, config

4. **DECIMAL para dinero**
   - Precisión exacta
   - No hay errores de redondeo
   - Estándar para finanzas

5. **servicio_final_id y empleada_final_id**
   - Permite cambios sin perder historial
   - Auditoría completa
   - Reportes precisos

### Campos que cambiaron desde el sistema JSON

| Campo JSON | Campo PostgreSQL | Razón |
|------------|------------------|-------|
| `created_at` (string ISO) | `created_at` (timestamptz) | Mejor soporte nativo |
| `horarios` (array) | `horarios` (jsonb) | Indexable, queries más rápidas |
| `password` (plain) | `password_hash` (string) | Seguridad (bcrypt) |

---

## 🐛 Issues Conocidos

### Ninguno
Esta es la versión inicial, sin issues conocidos.

### Para Reportar Issues
1. Revisar documentación en `/database/`
2. Consultar Troubleshooting en README.md
3. Verificar logs de PostgreSQL
4. Abrir issue en el repositorio

---

## 🤝 Contribuciones

### Mejoras Futuras Consideradas

- [ ] Particionamiento de tabla `turnos` (cuando > 10M registros)
- [ ] Índices parciales para estados específicos
- [ ] Vistas materializadas para reportes complejos
- [ ] Políticas RLS más granulares
- [ ] Extensión pg_cron para tareas programadas
- [ ] Extensión pg_stat_statements habilitada por defecto
- [ ] Replicación para alta disponibilidad
- [ ] Pool de conexiones con PgBouncer

---

## 📚 Recursos

### Documentación
- PostgreSQL Docs: https://www.postgresql.org/docs/
- node-postgres: https://node-postgres.com/
- DonWeb VPS: https://donweb.com/es-ar/ayuda/vps

### Herramientas Recomendadas
- pgAdmin 4 (GUI)
- DBeaver (GUI multiplataforma)
- pgcli (CLI mejorado)
- pg_stat_statements (monitoring)

---

## 📄 Licencia

Este schema y documentación son parte del proyecto Narella Turnos.

---

## ✍️ Autor y Mantenimiento

Creado como parte de la migración del sistema Narella de JSON a PostgreSQL.

**Fecha de creación**: 2026-01-27
**Versión inicial**: 1.0.0
**Estado**: Producción Ready ✅

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar `database/README.md` (Troubleshooting)
2. Consultar `database/SCHEMA_DESIGN.md` (Documentación técnica)
3. Ver `database/migration-guide.md` (Guía de migración)
4. Abrir un issue en el repositorio

---

**🎉 ¡El schema está listo para usar en producción!**
