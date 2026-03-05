# Deployment

## Target platform
- Default deployment target: Vercel.
- Runtime: Node.js / Next.js App Router.

## Required production configuration
Set these variables before promoting to production:
- `SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`

If invoicing is enabled, also set ARCA/AFIP variables documented in `ENV_VARIABLES.md`.

## Pre-deploy checklist
1. Install deps and lockfile consistency check.
2. Run lint/tests.
3. Run `npx secure-repo audit`.
4. Verify no `.env` file is committed in repository root.

## Deploy steps
1. Push to main branch.
2. Vercel builds and deploys.
3. Confirm health by testing:
   - Login flow
   - Appointment creation and payment
   - Admin configuration pages
   - Protected cron endpoints authentication

## Post-deploy validation
- Inspect server logs for runtime errors.
- Validate storage cleanup and confirmation jobs.
- Confirm Twilio/ARCA integrations in the target environment.

## Rollback
1. Re-deploy last known good release from Vercel dashboard.
2. Revert problematic code change in git.
3. Rotate credentials if rollback was triggered by a security event.
