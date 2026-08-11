# Production runbook

## Required services

- PostgreSQL with automated daily backups and point-in-time recovery.
- Signed Cloudinary storage credentials.
- SMTP with SPF, DKIM and DMARC enabled.
- Cloudflare Turnstile public and secret keys.
- Final HTTPS values for `APP_ORIGIN` and `SITE_URL`.
- A long random `JWT_SECRET`, a separate `BACKUP_ENCRYPTION_KEY`, administrator MFA and a private `METRICS_TOKEN`.
- Redis through `REDIS_URL` for durable delivery, push-notification and media-processing queues.
- A malware scanner through `MALWARE_SCAN_URL` and, when required, `MALWARE_SCAN_TOKEN`.
- Paystack credentials when `PAYMENT_PROVIDER=paystack`.
- An error-alert destination in `ERROR_WEBHOOK_URL` and a recorded restore rehearsal in `BACKUP_VERIFIED_AT`.

`GET /api/ready` must return HTTP 200 before traffic is switched to a new release.

## Release sequence

1. Back up PostgreSQL and confirm the most recent restore test.
2. Deploy the application to staging.
3. Run the quality pipeline and apply the checked-in SQL migrations.
4. Verify registration, email verification, MFA, contact, commission, upload and payment sandbox flows.
5. Deploy production with the previous image retained for rollback.
6. Check `/api/health`, `/api/ready`, queue depth and error alerts.
7. Roll back immediately when readiness fails or error rate materially increases.

## Capacity boundary

This release is intentionally limited to one web-service instance. The process-local
rate limiter and the web-hosted background-job runner are not safe to scale
horizontally. `WEB_CONCURRENCY` must remain `1`. Before adding another instance:

1. move rate-limit state to Redis or another shared store;
2. move email and maintenance processing into a dedicated worker;
3. replace whole-state persistence paths with direct transactional PostgreSQL repositories;
4. load-test concurrency, retry and idempotency behavior.

## Payment operations

Configure the Paystack webhook as:

`https://YOUR_DOMAIN/api/payments/webhook`

Webhook signatures are verified and provider event IDs are idempotent. Review paid, failed, expired and inventory-reservation states from the Orders administration page.

## Monitoring

Scrape `/api/metrics` using `Authorization: Bearer METRICS_TOKEN`. Alert on readiness failure, email failures, rising queue depth, pending-order age, high memory and repeated HTTP 5xx responses.

## Recovery

Database backups are owned by the PostgreSQL provider. Perform a restore rehearsal at least quarterly. Cloudinary assets require their own retention policy. Rotate SMTP, Cloudinary, Paystack, JWT and monitoring credentials after any suspected exposure.

Record the successful rehearsal timestamp as an ISO 8601 value in
`BACKUP_VERIFIED_AT`. A backup existing is not the same as a verified restore.

Run `npm run backup:rehearse` against a disposable `RESTORE_DATABASE_URL`. The rehearsal creates an AES-256-GCM archive using `BACKUP_ENCRYPTION_KEY`, deletes the plaintext dump, decrypts into a temporary restore file, restores it, and compares the source and restored table inventories. Never point `RESTORE_DATABASE_URL` at production. Record the successful output and update `BACKUP_VERIFIED_AT` at least quarterly.

Redis jobs use bounded exponential retries. Administrators can inspect and retry dead-lettered delivery, notification and media-processing jobs in Studio Control → Support Analytics. Keep Redis persistence enabled and alert on growing waiting or failed counts.

## Credential rotation

Rotate any credential that has appeared in chat, screenshots, logs, or source
history. Rotate Cloudinary API secrets, Gmail app passwords, Turnstile keys,
administrator passwords, JWT and metrics tokens independently. Redeploy, test
each integration from Studio Control, then revoke the old credential.
