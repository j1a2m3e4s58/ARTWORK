# Production runbook

## Required services

- PostgreSQL with automated daily backups and point-in-time recovery.
- Signed Cloudinary storage credentials.
- SMTP with SPF, DKIM and DMARC enabled.
- Cloudflare Turnstile public and secret keys.
- Final HTTPS values for `APP_ORIGIN` and `SITE_URL`.
- A long random `JWT_SECRET`, administrator MFA and a private `METRICS_TOKEN`.
- Paystack credentials when `PAYMENT_PROVIDER=paystack`.

`GET /api/ready` must return HTTP 200 before traffic is switched to a new release.

## Release sequence

1. Back up PostgreSQL and confirm the most recent restore test.
2. Deploy the application to staging.
3. Run the quality pipeline and apply the checked-in SQL migrations.
4. Verify registration, email verification, MFA, contact, commission, upload and payment sandbox flows.
5. Deploy production with the previous image retained for rollback.
6. Check `/api/health`, `/api/ready`, queue depth and error alerts.
7. Roll back immediately when readiness fails or error rate materially increases.

## Payment operations

Configure the Paystack webhook as:

`https://YOUR_DOMAIN/api/payments/webhook`

Webhook signatures are verified and provider event IDs are idempotent. Review paid, failed, expired and inventory-reservation states from the Orders administration page.

## Monitoring

Scrape `/api/metrics` using `Authorization: Bearer METRICS_TOKEN`. Alert on readiness failure, email failures, rising queue depth, pending-order age, high memory and repeated HTTP 5xx responses.

## Recovery

Database backups are owned by the PostgreSQL provider. Perform a restore rehearsal at least quarterly. Cloudinary assets require their own retention policy. Rotate SMTP, Cloudinary, Paystack, JWT and monitoring credentials after any suspected exposure.
