# Database Operations

## Architecture
- Primary data backend: Supabase (PostgreSQL + storage buckets).
- Fallback backend for local/dev: JSON localdb file (`LOCALDB_FILE`).
- In production, localdb fallback should remain disabled unless explicitly approved.

## Environments
- Development: `.env.local` can use localdb and/or Supabase.
- Production: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are mandatory.

## Migrations and schema changes
1. Apply schema changes in a staging project first.
2. Validate API endpoints that depend on changed columns.
3. Roll forward with explicit SQL migration scripts and record execution date.
4. Keep backward compatibility for at least one deploy window.

## Backups and restore
- Supabase automated backups are the source of truth for production.
- Local recovery scripts:
  - `scripts/tenant-recovery.js`
  - `scripts/restore-from-localdb.js`
- Test restore procedures quarterly.

## Access control
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client bundles.
- Restrict service-role usage to server routes and maintenance scripts.
- Rotate credentials immediately after suspected leakage.

## Data retention
Retention is controlled via env variables:
- `FACTURAS_STORAGE_RETENTION_DAYS`
- `GIFTCARDS_STORAGE_RETENTION_DAYS`

Cleanup is executed through protected cron routes using `CRON_SECRET`.
