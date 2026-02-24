# Configuración de Twilio para WhatsApp

## Variables de Entorno Requeridas

Agregar las siguientes variables de entorno al archivo `.env.local` o en la configuración del hosting:

```env
# Credenciales de Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# URL pública de la aplicación (para links de confirmación)
NEXT_PUBLIC_APP_URL=https://tu-dominio.com

# (Opcional) Secret para proteger el cron de recordatorios
CRON_SECRET=un-secreto-seguro-aqui
```

## Cómo Obtener las Credenciales

### 1. Crear cuenta en Twilio
1. Ir a [https://www.twilio.com](https://www.twilio.com)
2. Registrarse con usuario y teléfono
3. Verificar el número de teléfono

### 2. Obtener Account SID y Auth Token
1. Ir a **Console** > **Account** > **API keys & tokens**
2. Copiar el **Account SID** (empieza con `AC`)
3. Copiar el **Auth Token**

### 3. Configurar WhatsApp Sandbox (Desarrollo)
1. Ir a **Console** > **Messaging** > **Try it out** > **Send a WhatsApp message**
2. Seguir las instrucciones para unirse al sandbox
3. El número de sandbox es: `whatsapp:+14155238886`

### 4. Configurar WhatsApp Business (Producción)
1. Ir a **Console** > **Messaging** > **Senders** > **WhatsApp senders**
2. Solicitar acceso a WhatsApp Business API
3. Configurar el número de negocio verificado
4. Actualizar `TWILIO_WHATSAPP_FROM` con el número de producción

## Endpoints Disponibles

### Enviar Confirmación Manual
```
POST /api/turnos/{id}/send-whatsapp
```
- Si Twilio está configurado: envía directamente por API
- Si no: retorna URL de `wa.me` para envío manual

### Recordatorios Automáticos (24hs antes)
```
POST /api/recordatorios/enviar
Headers: Authorization: Bearer {CRON_SECRET}
```
- Busca turnos pendientes en las próximas 24-25 horas
- Envía recordatorio solo una vez por turno
- Marca `recordatorio_enviado_at` para no repetir

### Verificar Estado del Servicio
```
GET /api/recordatorios/enviar
```
Retorna si Twilio está configurado.

## Configurar Cron Job

### Vercel Cron
Agregar en `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/recordatorios/enviar",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Alternativa: Cron externo
Usar servicios como:
- [cron-job.org](https://cron-job.org)
- [EasyCron](https://www.easycron.com)
- AWS CloudWatch Events + Lambda

Ejemplo de llamada:
```bash
curl -X POST https://tu-dominio.com/api/recordatorios/enviar \
  -H "Authorization: Bearer tu-cron-secret"
```

## Variables del Mensaje

El mensaje de WhatsApp incluye estas variables:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `{cliente}` | Nombre completo del cliente | María García |
| `{servicio}` | Nombre del servicio | Corte y color |
| `{empleada}` | Nombre y apellido de quien atiende | Ana Lopez |
| `{fecha}` | Fecha del turno | lunes 27 de enero de 2026 |
| `{hora}` | Hora del turno | 14:30 |
| `{duracion}` | Duración en minutos | 60 |
| `{link}` | Link de confirmación | https://ejemplo.com/confirmar/abc123 |

## Página de Confirmación del Cliente

Cuando el cliente hace clic en el link, ve:
- Nombre del servicio
- Nombre de quien lo atiende
- Fecha y hora
- Duración
- Botones para confirmar o cancelar

URL: `https://tu-dominio.com/confirmar/{token}`

## Migración de Base de Datos

Ejecutar la migración para agregar el campo de recordatorios:

```sql
-- database/migrations/004_add_recordatorio_enviado.sql
ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;
```

## Troubleshooting

### El mensaje no se envía
1. Verificar que las 3 variables de entorno estén configuradas
2. Revisar logs en la consola de Twilio
3. En sandbox: verificar que el destinatario esté unido al sandbox

### Error "Twilio no está configurado"
- Verificar que `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_FROM` estén definidas

### El recordatorio se envía múltiples veces
- Verificar que la migración `004_add_recordatorio_enviado.sql` se haya ejecutado
- El sistema marca `recordatorio_enviado_at` después de enviar exitosamente

### Formato de teléfono incorrecto
- El sistema sanitiza automáticamente los números
- Formato esperado: código de país + número (ej: +5491155551234)
- Si no tiene +, asume Argentina (+54)
