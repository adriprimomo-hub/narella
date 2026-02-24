# PostgreSQL para Sistema Narella - Resumen Ejecutivo

## ¿Por qué PostgreSQL?

✅ **Recomendación: PostgreSQL es la mejor opción para tu proyecto**

### Razones principales:

1. **Gratuito y open source** - Sin costos de licencia
2. **Eficiente en recursos** - Funciona bien en VPS básico (1-2 GB RAM)
3. **Robusto y confiable** - Usado por millones de aplicaciones
4. **Compatible con tu stack** - Perfecto para Next.js/TypeScript
5. **Continuidad** - Venías de Supabase que usa PostgreSQL

### Comparación rápida:

| Criterio | PostgreSQL | MySQL | SQL Server | SQLite |
|----------|------------|-------|------------|--------|
| Costo | ✅ Gratis | ✅ Gratis | ❌ Pago | ✅ Gratis |
| VPS 1-2GB | ✅ Ideal | ✅ Bien | ❌ Pesado | ⚠️ Limitado |
| Concurrencia | ✅ Excelente | ✅ Buena | ✅ Excelente | ❌ Limitada |
| Mantenimiento | ✅ Simple | ✅ Simple | ❌ Complejo | ✅ Mínimo |
| Recomendado | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ |

---

## ¿Qué incluye este paquete?

### 📄 Archivos creados:

1. **`schema.sql`** (1000+ líneas)
   - Schema completo de PostgreSQL
   - 19 tablas con índices optimizados
   - Triggers, vistas, funciones útiles
   - Listo para importar

2. **`seed.sql`** (500+ líneas)
   - Datos de ejemplo para desarrollo
   - Incluye usuarios, clientes, turnos, pagos
   - Útil para testing

3. **`SCHEMA_DESIGN.md`** (documentación detallada)
   - Explicación de cada tabla
   - Decisiones de diseño
   - Queries comunes
   - Optimizaciones de performance

4. **`README.md`** (guía de instalación)
   - Paso a paso para instalar en VPS DonWeb
   - Configuración de PostgreSQL
   - Comandos útiles
   - Troubleshooting

5. **`example-client.ts`** (ejemplos de código)
   - 10+ ejemplos de queries con node-postgres
   - Transacciones, JOINs, búsquedas
   - Integración con Next.js API routes

6. **`migration-guide.md`** (guía de migración)
   - Plan completo de migración desde JSON
   - 6 fases con checklist
   - Rollback plan
   - Troubleshooting

7. **`scripts/migrate-to-postgres.ts`** (script ejecutable)
   - Migración automática de datos
   - Dry-run mode
   - Manejo de errores

---

## Implementación: 3 Pasos Simples

### Paso 1: Instalar PostgreSQL en VPS (30 min)

```bash
# Conectar al VPS
ssh usuario@tu-vps.donweb.com

# Instalar PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib -y

# Crear base de datos y usuario
sudo -u postgres psql
CREATE DATABASE narella_db;
CREATE USER narella_user WITH ENCRYPTED PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE narella_db TO narella_user;
\q
```

### Paso 2: Importar el Schema (5 min)

```bash
# Copiar schema al servidor
scp database/schema.sql usuario@tu-vps:/tmp/

# Importar
sudo -u postgres psql -d narella_db -f /tmp/schema.sql
```

### Paso 3: Migrar tus datos (30 min)

```bash
# En tu máquina local
export DATABASE_URL="postgresql://narella_user:password@IP_VPS:5432/narella_db"
npx tsx scripts/migrate-to-postgres.ts
```

**¡Listo!** Tu base de datos está configurada y con tus datos migrados.

---

## Estructura de la Base de Datos

### Tablas principales (19 en total):

```
Core:
├── usuarios          (Usuarios del sistema)
├── clientes          (Clientes del salón)
├── empleadas         (Profesionales)
└── servicios         (Servicios ofrecidos)

Operaciones:
├── turnos            (Citas agendadas) ⭐ TABLA CRÍTICA
├── pagos             (Cobros de servicios)
├── senas             (Anticipos de clientes)
└── adicionales       (Servicios extra)

Inventario:
├── productos         (Para venta)
├── insumos           (Consumibles)
├── producto_movimientos
└── insumo_movimientos

Finanzas:
├── caja_movimientos  (Ingresos/egresos)
├── adelantos         (A empleadas)
└── metodos_pago_config

Sistema:
├── confirmation_tokens (WhatsApp)
├── recordatorios
├── turno_adicionales
└── servicio_empleada_comisiones
```

### Características del schema:

✅ **Normalizado (3NF)** - Sin redundancia
✅ **Integridad referencial** - Foreign keys configuradas
✅ **Índices optimizados** - Queries rápidas (< 50ms)
✅ **Triggers automáticos** - updated_at se actualiza solo
✅ **Vistas útiles** - v_turnos_completos, v_caja_resumen
✅ **Funciones** - calcular_comision_turno()
✅ **Multi-tenancy** - Soporte para múltiples locales

---

## Performance Esperada

### Con VPS básico (1-2 GB RAM):

| Operación | Tiempo esperado |
|-----------|-----------------|
| Login | < 100ms |
| Listar turnos del día | < 20ms |
| Crear turno | < 30ms |
| Registrar pago | < 50ms |
| Reporte liquidación | < 200ms |
| Búsqueda de clientes | < 30ms |

### Capacidad:

- **Usuarios simultáneos**: 10-20 sin problemas
- **Turnos por día**: Cientos (sin degradación)
- **Datos históricos**: Años de información
- **Crecimiento**: Escala fácilmente con upgrade de VPS

---

## Seguridad

### Implementado:

✅ Passwords hasheados (bcrypt)
✅ Foreign keys con constraints
✅ Validaciones a nivel de DB (CHECK constraints)
✅ Separación por usuario_id (tenant isolation)
✅ Prepared statements (previene SQL injection)

### A configurar en producción:

- [ ] SSL/TLS para conexiones
- [ ] Firewall limitando acceso al puerto 5432
- [ ] Backups automáticos diarios
- [ ] Monitoreo de logs
- [ ] Variables de entorno seguras

---

## Costos

### Infraestructura:

| Item | Costo mensual (estimado) |
|------|--------------------------|
| VPS DonWeb básico (1-2GB) | ~$10-20 USD |
| PostgreSQL | $0 (incluido en VPS) |
| Dominio | ~$10-15 USD/año |
| **TOTAL** | **~$10-20 USD/mes** |

### Comparación con alternativas:

- Supabase Free: $0 pero con límites estrictos
- Supabase Pro: $25 USD/mes
- AWS RDS: $15-50 USD/mes
- **PostgreSQL en VPS**: $0 (solo VPS)

---

## Mantenimiento

### Tareas automáticas (configurar una vez):

✅ Vacuum automático (PostgreSQL lo hace)
✅ Backups diarios con cron
✅ Rotación de logs

### Tareas manuales (opcionales):

- Revisar queries lentas: 1 vez por mes
- Actualizar PostgreSQL: 1-2 veces por año
- Revisar tamaño de DB: Ocasional

### Tiempo de mantenimiento: **< 1 hora/mes**

---

## Próximos Pasos

### Inmediato (hoy):

1. ✅ Revisar documentación (ya está lista)
2. ✅ Instalar PostgreSQL en VPS
3. ✅ Importar schema
4. ✅ Probar con datos de ejemplo (seed.sql)

### Corto plazo (esta semana):

5. ✅ Migrar tus datos actuales
6. ✅ Adaptar API routes de Next.js
7. ✅ Testing completo
8. ✅ Deploy a producción

### Mediano plazo (próximas semanas):

9. Configurar backups automáticos
10. Implementar monitoreo
11. Optimizar según uso real

---

## Soporte y Recursos

### Documentación incluida:

- 📘 `SCHEMA_DESIGN.md` - Diseño completo y queries
- 📗 `README.md` - Instalación y configuración
- 📙 `migration-guide.md` - Guía de migración paso a paso
- 📕 `example-client.ts` - Ejemplos de código

### Recursos externos:

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [node-postgres](https://node-postgres.com/)
- [DonWeb Soporte](https://donweb.com/es-ar/ayuda)

### Necesitas ayuda?

- Revisa `database/README.md` sección Troubleshooting
- Consulta `migration-guide.md` para problemas de migración
- Los logs están en `/var/log/postgresql/`

---

## Preguntas Frecuentes

### ¿Es difícil migrar desde el sistema JSON actual?

No. El script `migrate-to-postgres.ts` hace todo automáticamente. Solo necesitas:
1. Exportar `DATABASE_URL`
2. Ejecutar el script
3. Verificar que todo se migró correctamente

Tiempo estimado: **30 minutos**

### ¿Qué pasa si algo sale mal?

Tenés un **Rollback Plan** completo en `migration-guide.md`. Básicamente:
1. Restaurar el backup del JSON
2. Revertir el código con git
3. Redeploy

### ¿PostgreSQL es difícil de usar?

No. Los ejemplos en `example-client.ts` muestran todo lo que necesitas. Las queries son muy similares a las que ya conoces.

### ¿Puedo seguir usando mi sistema actual mientras pruebo?

Sí. Podés instalar PostgreSQL en un ambiente de desarrollo local primero, migrar los datos, y probar todo antes de ir a producción.

### ¿Cuánto ocupa la base de datos?

Con los datos de ejemplo: ~5 MB
Con 1 año de datos (salón mediano): ~50-100 MB
Muy manejable para un VPS básico.

---

## Conclusión

PostgreSQL es la opción ideal para tu proyecto:

✅ **Robusto** - Maneja tu carga sin problemas
✅ **Económico** - Sin costos adicionales
✅ **Simple** - Fácil de instalar y mantener
✅ **Escalable** - Crece con tu negocio
✅ **Documentado** - Todo lo que necesitas está incluido

**Próximo paso:** Seguir las instrucciones en `database/README.md` para la instalación.
