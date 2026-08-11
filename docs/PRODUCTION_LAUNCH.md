# Production launch runbook

## Staging configuration

Create the Render Blueprint from `render.yaml`, then set every secret marked `sync: false`. Do not reuse local or test credentials. Keep `PAYMENT_PROVIDER=manual` until the sandbox rehearsal is signed off.

Required provider checks:

1. PostgreSQL is attached through `DATABASE_URL`; `/api/ready` reports `postgresql-relational`.
2. Cloudinary is configured and `STORAGE_PROVIDER=cloudinary`.
3. SMTP sends verification, invitation, reset, message-reply and order emails.
4. Turnstile succeeds and fails closed on public mutation forms.
5. `APP_ORIGIN` and `SITE_URL` are the exact HTTPS staging origin; `TRUST_PROXY=true`.
6. `SENTRY_DSN` (or `ERROR_WEBHOOK_URL`) receives a deliberate staging alert
   and `METRICS_TOKEN` protects `/api/metrics`.

Run:

```sh
npm run media:audit
npm run staging:smoke
npm run launch:review
```

The current starter-media audit must reach zero unverified assets before production. Upload original Reigns Atelier artwork or record the source, licence URL and verification date in Admin. External starter assets are hidden in production when `ALLOW_STARTER_MEDIA=false`.

## Authentication and email rehearsal

Use fresh test addresses to verify registration, email verification, resend verification, login, logout, forgotten-password reset, staff invitation, invitation acceptance, admin password re-check and MFA. Save the generated one-time recovery codes offline, test one recovery code, and regenerate the remaining set. Confirm the Admin inbox receives customer messages and replies produce an email plus an audit record. Create and verify a second administrator before launch so access does not depend on one account.

## Payment rehearsal

Set Paystack test keys and `PAYSTACK_TEST_EMAIL`, switch staging to `PAYMENT_PROVIDER=paystack`, then run:

```sh
npm run payment:rehearse -- --initialize
```

Complete the returned sandbox checkout, verify the webhook exactly once, confirm the order becomes paid, and confirm inventory is not decremented twice. Return to manual mode until launch approval. Live keys are accepted only during `npm run launch:review -- --production`.

## Backup restoration

Create a disposable PostgreSQL database, never the production database, and set `RESTORE_DATABASE_URL`. With PostgreSQL client tools installed:

```sh
npm run backup:rehearse
```

Record the archive timestamp, restored table inventory and reviewer. Also perform a Render-managed backup restoration rehearsal before launch.

## Go/no-go

- CI lint, types, unit/integration, production build, dependency audit, Playwright and Axe checks pass.
- `/api/ready` is HTTP 200; metrics and alert delivery are verified.
- Media licence audit is clean and original artwork is approved.
- SMTP, authentication, Admin inbox and Paystack sandbox evidence is retained.
- Database restore is demonstrated against a disposable target.
- Rollback owner, incident contact, DNS plan and maintenance window are documented.
- `WEB_CONCURRENCY=1`; horizontal scaling remains blocked until shared rate limiting, direct transactional repositories and a dedicated job worker are deployed.
- Exposed Cloudinary, Gmail, Turnstile and administrator credentials have been rotated and the old credentials revoked.
