#!/bin/bash
# ============================================
# Script de Configuración Inicial - PostgreSQL
# ============================================
# Este script automatiza la configuración inicial de PostgreSQL
# para el sistema Narella en un VPS nuevo.
#
# Uso (como root o con sudo):
#   chmod +x scripts/setup-postgres.sh
#   sudo ./scripts/setup-postgres.sh
#
# El script:
# 1. Instala PostgreSQL si no está instalado
# 2. Crea la base de datos y usuario
# 3. Importa el schema
# 4. Opcionalmente importa datos de ejemplo
# 5. Configura backups automáticos
# ============================================

set -e  # Exit on error

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuración (se puede personalizar)
DB_NAME="narella_db"
DB_USER="narella_user"
SCHEMA_FILE="database/schema.sql"
SEED_FILE="database/seed.sql"

# Banner
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   Configuración PostgreSQL - Narella${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Verificar que se ejecuta como root o con sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}✗ Este script debe ejecutarse como root o con sudo${NC}"
  echo "  Ejecuta: sudo $0"
  exit 1
fi

# Función para preguntar al usuario
ask_yes_no() {
  local prompt="$1"
  local default="${2:-n}"

  if [ "$default" = "y" ]; then
    prompt="$prompt [Y/n]: "
  else
    prompt="$prompt [y/N]: "
  fi

  read -p "$prompt" response
  response=${response:-$default}

  if [[ "$response" =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# 1. Instalar PostgreSQL
echo -e "${BLUE}=== Paso 1: Instalar PostgreSQL ===${NC}"

if command -v psql &> /dev/null; then
  PG_VERSION=$(psql --version | awk '{print $3}')
  echo -e "${GREEN}✓ PostgreSQL ya está instalado (versión $PG_VERSION)${NC}"
else
  echo "PostgreSQL no está instalado."

  if ask_yes_no "¿Deseas instalarlo ahora?" "y"; then
    echo "Actualizando repositorios..."
    apt update -qq

    echo "Instalando PostgreSQL..."
    apt install -y postgresql postgresql-contrib

    echo -e "${GREEN}✓ PostgreSQL instalado exitosamente${NC}"

    # Iniciar servicio
    systemctl start postgresql
    systemctl enable postgresql

    echo -e "${GREEN}✓ Servicio PostgreSQL iniciado y habilitado${NC}"
  else
    echo -e "${RED}✗ PostgreSQL es requerido. Saliendo.${NC}"
    exit 1
  fi
fi

echo ""

# 2. Generar password seguro
echo -e "${BLUE}=== Paso 2: Configurar Credenciales ===${NC}"

if ask_yes_no "¿Generar password aleatorio seguro?" "y"; then
  DB_PASSWORD=$(openssl rand -base64 24)
  echo -e "${GREEN}Password generado:${NC} $DB_PASSWORD"
  echo -e "${YELLOW}⚠ IMPORTANTE: Guarda este password en un lugar seguro${NC}"
else
  echo "Ingresa el password para el usuario de la base de datos:"
  read -s DB_PASSWORD
  echo ""
fi

echo ""

# 3. Crear base de datos y usuario
echo -e "${BLUE}=== Paso 3: Crear Base de Datos ===${NC}"

# Verificar si ya existe
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo -e "${YELLOW}⚠ La base de datos '$DB_NAME' ya existe${NC}"

  if ask_yes_no "¿Deseas eliminarla y recrearla?" "n"; then
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
    echo -e "${GREEN}✓ Base de datos eliminada${NC}"
  else
    echo "Usando base de datos existente"
    SKIP_CREATE_DB=true
  fi
fi

if [ "$SKIP_CREATE_DB" != true ]; then
  echo "Creando base de datos y usuario..."

  sudo -u postgres psql <<EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
EOF

  echo -e "${GREEN}✓ Base de datos '$DB_NAME' creada${NC}"
  echo -e "${GREEN}✓ Usuario '$DB_USER' creado${NC}"
fi

echo ""

# 4. Importar schema
echo -e "${BLUE}=== Paso 4: Importar Schema ===${NC}"

if [ -f "$SCHEMA_FILE" ]; then
  echo "Importando schema desde $SCHEMA_FILE..."

  sudo -u postgres psql -d "$DB_NAME" -f "$SCHEMA_FILE" > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Schema importado exitosamente${NC}"

    # Contar tablas creadas
    TABLE_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    echo "  Tablas creadas: $TABLE_COUNT"
  else
    echo -e "${RED}✗ Error al importar schema${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠ Archivo de schema no encontrado: $SCHEMA_FILE${NC}"
  echo "  Asegúrate de ejecutar este script desde la raíz del proyecto"
fi

echo ""

# 5. Importar datos de ejemplo (opcional)
echo -e "${BLUE}=== Paso 5: Datos de Ejemplo ===${NC}"

if [ -f "$SEED_FILE" ]; then
  if ask_yes_no "¿Deseas importar datos de ejemplo?" "n"; then
    echo "Importando datos desde $SEED_FILE..."

    sudo -u postgres psql -d "$DB_NAME" -f "$SEED_FILE" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓ Datos de ejemplo importados${NC}"
    else
      echo -e "${YELLOW}⚠ Algunos datos no se pudieron importar (puede ser normal)${NC}"
    fi
  fi
fi

echo ""

# 6. Configurar acceso remoto (opcional)
echo -e "${BLUE}=== Paso 6: Configuración de Acceso ===${NC}"

if ask_yes_no "¿Configurar acceso remoto (desde otras IPs)?" "n"; then
  echo "Configurando postgresql.conf..."

  PG_VERSION=$(ls /etc/postgresql/ | head -1)
  PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
  PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

  # Backup de configuración
  cp "$PG_CONF" "$PG_CONF.backup"
  cp "$PG_HBA" "$PG_HBA.backup"

  # Modificar listen_addresses
  sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

  # Agregar regla de acceso
  echo "" >> "$PG_HBA"
  echo "# Acceso remoto para Narella" >> "$PG_HBA"
  echo "host    $DB_NAME    $DB_USER    0.0.0.0/0    scram-sha-256" >> "$PG_HBA"

  echo -e "${GREEN}✓ Acceso remoto configurado${NC}"
  echo -e "${YELLOW}⚠ Recuerda configurar el firewall:${NC}"
  echo "  sudo ufw allow from TU_IP_LOCAL to any port 5432"

  # Reiniciar PostgreSQL
  systemctl restart postgresql
  echo -e "${GREEN}✓ PostgreSQL reiniciado${NC}"
fi

echo ""

# 7. Configurar backups automáticos
echo -e "${BLUE}=== Paso 7: Backups Automáticos ===${NC}"

if [ -f "scripts/backup-postgres.sh" ]; then
  if ask_yes_no "¿Configurar backup automático diario?" "y"; then
    # Hacer ejecutable
    chmod +x scripts/backup-postgres.sh

    # Crear directorio de backups
    mkdir -p /home/$(logname)/backups/narella

    # Agregar a crontab
    CRON_JOB="0 3 * * * DB_USER=$DB_USER DB_NAME=$DB_NAME $(pwd)/scripts/backup-postgres.sh >> /var/log/narella-backup.log 2>&1"

    # Verificar si ya existe
    if ! crontab -l 2>/dev/null | grep -q "backup-postgres.sh"; then
      (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
      echo -e "${GREEN}✓ Backup automático configurado (diario a las 3 AM)${NC}"
    else
      echo -e "${YELLOW}⚠ Backup automático ya estaba configurado${NC}"
    fi
  fi
fi

echo ""

# 8. Generar archivo .env
echo -e "${BLUE}=== Paso 8: Archivo de Configuración ===${NC}"

ENV_FILE=".env.production"

if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}⚠ El archivo $ENV_FILE ya existe${NC}"

  if ! ask_yes_no "¿Deseas sobrescribirlo?" "n"; then
    ENV_FILE=".env.production.new"
    echo "  Guardando en $ENV_FILE"
  fi
fi

cat > "$ENV_FILE" <<EOF
# PostgreSQL Configuration - Narella System
# Generated on $(date)

DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"

# Pool settings
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Para producción
NODE_ENV=production
EOF

echo -e "${GREEN}✓ Archivo de configuración creado: $ENV_FILE${NC}"
echo -e "${YELLOW}⚠ IMPORTANTE: No subas este archivo a git${NC}"

# Asegurar que .env está en .gitignore
if [ -f ".gitignore" ]; then
  if ! grep -q ".env.production" .gitignore; then
    echo ".env.production" >> .gitignore
    echo ".env.production.new" >> .gitignore
  fi
fi

echo ""

# 9. Verificación final
echo -e "${BLUE}=== Paso 9: Verificación ===${NC}"

echo "Verificando instalación..."

# Test de conexión
if PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Conexión a base de datos exitosa${NC}"
else
  echo -e "${RED}✗ No se pudo conectar a la base de datos${NC}"
  exit 1
fi

# Información de tablas
echo ""
echo "Resumen de la base de datos:"

PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
  SELECT
    schemaname,
    tablename,
    n_live_tup as rows
  FROM pg_stat_user_tables
  ORDER BY schemaname, tablename;
" | head -10 | sed 's/^/  /'

# Tamaño de la base
DB_SIZE=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
echo ""
echo "Tamaño de la base de datos: $DB_SIZE"

echo ""

# Resumen final
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✓ Configuración completada exitosamente${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "${BLUE}Información importante:${NC}"
echo ""
echo "Base de datos: $DB_NAME"
echo "Usuario:       $DB_USER"
echo "Password:      $DB_PASSWORD"
echo ""
echo "Cadena de conexión:"
echo "  postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo -e "${YELLOW}⚠ Guarda estas credenciales en un lugar seguro${NC}"
echo ""
echo "Próximos pasos:"
echo "  1. Configura tu aplicación Next.js con la cadena de conexión"
echo "  2. Si tienes datos para migrar, ejecuta: npx tsx scripts/migrate-to-postgres.ts"
echo "  3. Prueba la conexión desde tu aplicación"
echo ""
echo "Para conectarte manualmente:"
echo "  psql -U $DB_USER -d $DB_NAME"
echo ""
echo "Logs de PostgreSQL:"
echo "  /var/log/postgresql/postgresql-*-main.log"
echo ""

exit 0
