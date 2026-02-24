#!/bin/bash
# ============================================
# Script de Backup Automático - PostgreSQL
# ============================================
# Este script hace backup de la base de datos PostgreSQL
# y retiene los últimos 30 días.
#
# Uso:
#   chmod +x scripts/backup-postgres.sh
#   ./scripts/backup-postgres.sh
#
# Para automatizar con cron (backup diario a las 3 AM):
#   crontab -e
#   0 3 * * * /ruta/al/script/backup-postgres.sh >> /var/log/narella-backup.log 2>&1
# ============================================

# Configuración (ajustar según tu setup)
DB_NAME="${DB_NAME:-narella_db}"
DB_USER="${DB_USER:-narella_user}"
BACKUP_DIR="${BACKUP_DIR:-/home/usuario/backups/narella}"
RETENTION_DAYS=30

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}  Backup PostgreSQL - Sistema Narella${NC}"
echo -e "${GREEN}===========================================${NC}"
echo "Fecha: $(date)"
echo "Base de datos: $DB_NAME"
echo "Directorio: $BACKUP_DIR"
echo ""

# Verificar que PostgreSQL está corriendo
if ! pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
  echo -e "${RED}✗ Error: PostgreSQL no está disponible${NC}"
  echo "Verifica que el servicio esté corriendo: sudo systemctl status postgresql"
  exit 1
fi

echo -e "${GREEN}✓ PostgreSQL está disponible${NC}"

# Backup completo (formato custom - comprimido)
BACKUP_FILE="$BACKUP_DIR/narella_${TIMESTAMP}.dump"

echo ""
echo "Creando backup completo..."
if pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -b -v -f "$BACKUP_FILE" 2>&1 | grep -v "^pg_dump:"; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}✓ Backup completo creado: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
  echo -e "${RED}✗ Error al crear backup${NC}"
  exit 1
fi

# Backup solo schema (SQL plano)
SCHEMA_FILE="$BACKUP_DIR/narella_schema_${DATE_ONLY}.sql"

echo ""
echo "Creando backup de schema..."
if pg_dump -U "$DB_USER" -d "$DB_NAME" --schema-only -F p -f "$SCHEMA_FILE" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Schema guardado: $SCHEMA_FILE${NC}"
else
  echo -e "${YELLOW}⚠ Advertencia: No se pudo guardar el schema${NC}"
fi

# Backup solo datos
DATA_FILE="$BACKUP_DIR/narella_data_${DATE_ONLY}.dump"

echo ""
echo "Creando backup de datos..."
if pg_dump -U "$DB_USER" -d "$DB_NAME" --data-only -F c -f "$DATA_FILE" > /dev/null 2>&1; then
  DATA_SIZE=$(du -h "$DATA_FILE" | cut -f1)
  echo -e "${GREEN}✓ Datos guardados: $DATA_FILE ($DATA_SIZE)${NC}"
else
  echo -e "${YELLOW}⚠ Advertencia: No se pudo guardar solo los datos${NC}"
fi

# Información de la base de datos
echo ""
echo "Estadísticas de la base de datos:"

# Tamaño total
DB_SIZE=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
echo "  Tamaño total: $DB_SIZE"

# Cantidad de tablas
TABLE_COUNT=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "  Tablas: $TABLE_COUNT"

# Top 5 tablas más grandes
echo ""
echo "Tablas más grandes:"
psql -U "$DB_USER" -d "$DB_NAME" -t -c "
  SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  LIMIT 5;
" | sed 's/^/  /'

# Limpiar backups antiguos
echo ""
echo "Limpiando backups antiguos (> $RETENTION_DAYS días)..."

# Contar archivos a eliminar
OLD_FILES=$(find "$BACKUP_DIR" -name "narella_*.dump" -type f -mtime +$RETENTION_DAYS | wc -l)

if [ "$OLD_FILES" -gt 0 ]; then
  find "$BACKUP_DIR" -name "narella_*.dump" -type f -mtime +$RETENTION_DAYS -delete
  echo -e "${GREEN}✓ $OLD_FILES archivos antiguos eliminados${NC}"
else
  echo "  No hay archivos antiguos para eliminar"
fi

# Listar backups existentes
echo ""
echo "Backups disponibles:"
ls -lh "$BACKUP_DIR"/narella_*.dump 2>/dev/null | tail -10 | awk '{print "  " $9 " (" $5 ")"}'

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/narella_*.dump 2>/dev/null | wc -l)
echo ""
echo "Total de backups: $BACKUP_COUNT"

# Verificar espacio en disco
echo ""
echo "Espacio en disco:"
df -h "$BACKUP_DIR" | tail -1 | awk '{print "  Usado: " $3 " de " $2 " (" $5 ")"}'

# Resumen final
echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}✓ Backup completado exitosamente${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo "Archivos creados:"
echo "  - Completo: $BACKUP_FILE"
echo "  - Schema:   $SCHEMA_FILE"
echo "  - Datos:    $DATA_FILE"
echo ""
echo "Para restaurar:"
echo "  pg_restore -U $DB_USER -d $DB_NAME -c -v \"$BACKUP_FILE\""
echo ""

# Log de finalización
echo "$(date): Backup completado - $BACKUP_FILE" >> "$BACKUP_DIR/backup.log"

exit 0
