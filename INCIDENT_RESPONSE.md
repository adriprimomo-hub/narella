# Incident Response

## Scope
This runbook covers security incidents affecting authentication, data access, payments, invoicing, storage, or scheduled jobs.

## Severity levels
- `SEV-1`: Active data exposure, credential leak, or broad outage.
- `SEV-2`: High-risk vulnerability without confirmed exploitation.
- `SEV-3`: Limited impact bug or suspicious activity under investigation.

## Immediate actions
1. Create an incident channel and assign an incident commander.
2. Stop active impact (disable affected endpoints/integrations if needed).
3. Preserve evidence (logs, request ids, deployment version, timestamps).
4. Rotate potentially exposed secrets.

## Credential rotation priority
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `SESSION_SECRET`
3. `CRON_SECRET`
4. `TWILIO_AUTH_TOKEN`
5. ARCA/AFIP credentials (`AFIP_ACCESS_TOKEN` or cert/key pair)

## Containment playbook
- Disable risky cron routes until validated.
- Force logout by rotating `SESSION_SECRET` when session compromise is suspected.
- Revoke or rotate third-party tokens.
- Block abusive IPs at edge/provider level.

## Recovery
1. Patch root cause and deploy fix.
2. Validate critical flows (auth, payments, invoices, messaging).
3. Monitor error rate and suspicious traffic for at least 24 hours.

## Communication
- Keep an internal timeline with UTC timestamps.
- Notify stakeholders after containment with: impact, affected window, and mitigation.
- When required by policy/regulation, issue external communication with approved wording.

## Post-incident review
Within 5 business days:
1. Document root cause and contributing factors.
2. Add preventive controls (tests, alerts, policy updates).
3. Track follow-up actions with owners and due dates.
