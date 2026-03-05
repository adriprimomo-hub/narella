# Environment Variables

## Purpose
This file documents environment variables used by the application, grouped by domain.
Use `.env.local` for local development and configure production values in your hosting provider.

## Required in production

| Variable | Purpose | Sensitive |
| --- | --- | --- |
| `SESSION_SECRET` | Signs local session tokens and cookies. | Yes |
| `SUPABASE_URL` | Supabase project URL for server access. | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for privileged Supabase operations. | Yes |
| `NEXT_PUBLIC_APP_URL` | Public application URL used in links and redirects. | No |
| `CRON_SECRET` | Protects scheduled endpoints from unauthorized calls. | Yes |

## Authentication and session

| Variable | Default | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | none | Required in production. Use a long random value. |
| `PASSWORD_SALT_ROUNDS` | `12` | BCrypt rounds for password hashing. |
| `ALLOW_INSECURE_SESSION_SECRET` | `false` | Development override only. Keep `false` in production. |
| `ALLOW_TEST_LOGIN` | `false` | Enables bootstrap login endpoint outside production. |

## Runtime and URLs

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | framework-managed | Standard Node runtime mode. |
| `APP_TIMEZONE` | `America/Argentina/Buenos_Aires` | Timezone for date-based automation. |
| `NEXT_PUBLIC_APP_URL` | none | Main canonical app URL. |
| `NEXT_PUBLIC_CONFIRMATION_URL` | none | Optional override for confirmation links. |
| `NEXT_PUBLIC_SITE_URL` | none | Optional fallback for URL resolution. |
| `NEXT_PUBLIC_PUBLIC_URL` | none | Optional fallback for URL resolution. |
| `APP_URL` | none | Server-side URL fallback. |
| `SITE_URL` | none | Server-side URL fallback. |

## Data backend and local fallback

| Variable | Default | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | none | Supabase base URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | none | Supabase privileged API key. |
| `NEXT_PUBLIC_SUPABASE_URL` | none | Optional URL fallback used by scripts. |
| `ALLOW_LOCALDB_IN_PRODUCTION` | `false` | Keep disabled in production unless explicitly approved. |
| `LOCALDB_FILE` | `.localdb.json` | Local JSON persistence path. |
| `LOCALDB_PERSISTENCE` | auto | Disable with `false` when needed. |
| `LOCALDB_ENABLE_PERSISTENCE` | `false` | Force-enable persistence override. |

## Twilio / WhatsApp

| Variable | Default | Notes |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | none | Twilio account id. |
| `TWILIO_AUTH_TOKEN` | none | Twilio auth token. |
| `TWILIO_WHATSAPP_FROM` | none | Sender in `whatsapp:+...` format. |
| `TWILIO_WHATSAPP_DEFAULT_COUNTRY_CODE` | `54` | Used to normalize phone numbers. |
| `TWILIO_NOTIFY_TO` | none | Optional operator notification destination. |
| `TWILIO_WHATSAPP_TEMPLATE_CONFIRMATION` | none | Optional template id/reference. |

## ARCA / AFIP invoicing

| Variable | Default | Notes |
| --- | --- | --- |
| `AFIP_FACTURACION_ACTIVA` | `false` | Master switch for electronic invoicing. |
| `AFIP_PRODUCCION` | `false` | `true` for production endpoint. |
| `AFIP_CUIT` | none | Issuer CUIT. |
| `AFIP_PUNTO_VENTA` | none | Point-of-sale number. |
| `AFIP_CBTE_TIPO` | none | Invoice type code. |
| `AFIP_ACCESS_TOKEN` | none | Access token alternative to cert/key pair. |
| `AFIP_CERT_PATH` | none | Path to certificate file. |
| `AFIP_KEY_PATH` | none | Path to private key file. |
| `AFIP_CERT` | none | Inline PEM certificate alternative. |
| `AFIP_KEY` | none | Inline PEM private key alternative. |
| `AFIP_CERT_BASE64` / `AFIP_CERT_B64` | none | Base64 certificate alternative. |
| `AFIP_KEY_BASE64` / `AFIP_KEY_B64` | none | Base64 private key alternative. |
| `AFIP_IVA_ID` | `5` | IVA id used in invoice breakdown. |
| `AFIP_IVA_PORCENTAJE` | `21` | IVA percentage. |

ARCA-prefixed aliases are supported for compatibility (`ARCA_*`).

## Branding and printable assets

| Variable | Default | Notes |
| --- | --- | --- |
| `FACTURA_LOGO_PATH` | none | Path to default invoice logo. |
| `FACTURA_LOGO_DATA` | none | Data URL override for logo. |
| `FACTURA_LEYENDA` | none | Invoice legend text. |
| `FACTURA_LEYENDA_FOOTER` | none | Footer legend text. |
| `FACTURA_EMISOR_NOMBRE` | none | Issuer name for invoice footer/header. |
| `FACTURA_EMISOR_DOMICILIO` | none | Issuer address. |
| `FACTURA_EMISOR_TELEFONO` | none | Issuer phone. |
| `FACTURA_EMISOR_EMAIL` | none | Issuer email. |
| `GIFTCARD_TEMPLATE_PATH` | none | Path to giftcard template file. |
| `GIFTCARD_TEMPLATE_DATA` | none | Inline data URL template override. |

## Storage buckets

| Variable | Default |
| --- | --- |
| `SUPABASE_STORAGE_BUCKET_FACTURAS` | `facturas` |
| `SUPABASE_STORAGE_BUCKET_GIFTCARDS` | `giftcards` |
| `SUPABASE_STORAGE_BUCKET_SHARE_FILES` | `share-files` |
| `SUPABASE_STORAGE_BUCKET_TURNOS_FOTOS` | `turnos-fotos` |

## Scheduled jobs and retention

| Variable | Default | Notes |
| --- | --- | --- |
| `CRON_SECRET` | none | Required to call cron endpoints. |
| `CONFIRMATION_TOKEN_TTL_HOURS` | `48` | Confirmation token lifetime. |
| `DECLARACION_JURADA_LINK_TTL_HOURS` | `24` | Signed link lifetime. |
| `SHARE_LINK_TTL_DAYS` | `7` | Shared file link duration. |
| `REPORTES_SERVICIO_VENCIDO_DIAS` | `30` | Service expiration threshold. |
| `STORAGE_MIGRATION_BATCH_SIZE` | `100` | Batch size for migration pass. |
| `STORAGE_CLEANUP_BATCH_SIZE` | `100` | Batch size for cleanup pass. |
| `FACTURAS_STORAGE_RETENTION_DAYS` | `3650` | Invoice retention in days. |
| `GIFTCARDS_STORAGE_RETENTION_DAYS` | `3650` | Giftcard retention in days. |
