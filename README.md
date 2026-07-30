# Reigns Atelier

A responsive fine-art portfolio, commission studio, customer portal, shop catalogue, administration system and installable web app.

## Local development

1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET`, administrator email and administrator password.
3. Install and run:

```bash
npm install
npm run dev
```

The website runs at `http://127.0.0.1:43127`; its API runs at `http://127.0.0.1:43130`.

## Quality checks

```bash
npm run check
```

This runs linting, JavaScript project checks, backend validation tests, the production build and a production dependency security audit. The same checks run on every GitHub push and pull request.

## Production services

Production should configure:

- `DATABASE_URL` for the relational PostgreSQL entity tables
- `STORAGE_PROVIDER=cloudinary` with signed Cloudinary API credentials
- an email provider for invitations, resets and customer replies. Render free web services block SMTP ports, so use `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and a verified `EMAIL_FROM` domain, or use SMTP only after upgrading the Render web service.
- `PAYMENT_PROVIDER=paystack` and Paystack credentials when online checkout is enabled
- `APP_ORIGIN` and `SITE_URL` using the final HTTPS domain
- long, unique administrator and JWT secrets, plus administrator MFA

Without `DATABASE_URL`, the API intentionally uses a local JSON development store. Without cloud storage, uploads use the local filesystem. Neither local fallback should be used for a multi-instance production deployment.

### Paystack checkout

The Art Shop supports Paystack-hosted checkout for Ghana Mobile Money and cards. Keep manual methods enabled until the live account has been approved and a sandbox rehearsal succeeds.

Configure:

- `PAYMENT_PROVIDER=paystack`
- `PAYMENT_CURRENCY=GHS`
- `PAYSTACK_SECRET_KEY=sk_test_...` for rehearsal, then the live secret after approval
- Paystack webhook URL: `https://reigns-atelier.onrender.com/api/payments/webhook`

Customers select Mobile Money or card on Paystack's secure page. Mobile Money authorization and the customer's PIN remain between the customer, Paystack, and the mobile network; this application never requests or stores the PIN.

## Container deployment

`Dockerfile` builds the frontend and runs the hardened API. `docker-compose.yml` provides a PostgreSQL-backed production-like environment:

```bash
docker compose up --build
```

Terminate TLS through a trusted reverse proxy or managed hosting provider. The application exposes `/api/health` for liveness and `/api/ready` for operational readiness.

## Security model

- Passwords are hashed using bcrypt.
- Signed sessions use HTTP-only, secure production cookies.
- Mutations use same-site CSRF tokens.
- Password-reset and invitation tokens are time-limited, hashed and single-use.
- Suspended accounts lose existing sessions.
- Administrator, editor and support permissions are enforced by the API.
- Protected customer actions require a verified email address.
- Production administrators must use authenticator-based MFA.
- Payloads are validated and bounded.
- Public forms, authentication and uploads are rate-limited.
- Upload contents are inspected and restricted to safe image/video formats.
- Important changes create administrator audit records.
- Business records use recoverable soft deletion.
- Failed transactional email is queued and retried with bounded backoff.

## Backups and recovery

Local development creates rotating JSON backups in `server/data/backups`. PostgreSQL production backups must be enabled with the database provider and periodically restore-tested. The admin System page exposes readiness warnings, audit history and manual local backup controls.

## Email

Invitations never contain passwords. Invitees receive a time-limited link and create their own password. When SMTP is unavailable, replies remain visible in the customer portal and display a pending-delivery warning in the admin Inbox.

## Paystack hosted checkout

Keep `PAYMENT_PROVIDER=manual` until a Paystack test account is ready. To rehearse secure card and Ghana Mobile Money checkout:

1. Add `PAYMENT_PROVIDER=paystack`, `PAYMENT_CURRENCY=GHS` and the Paystack **test** secret as `PAYSTACK_SECRET_KEY` in Render.
2. Configure the Paystack webhook URL as `https://YOUR-DOMAIN/api/payments/webhook`.
3. Redeploy, place a test order and verify that the order changes to paid only after Paystack's signed webhook is received.
4. Complete Paystack compliance and repeat the rehearsal with live credentials before accepting real payments.

Checkout is hosted by Paystack. The website never asks for or stores a customer's Mobile Money PIN.

## Deployment checklist

1. Replace or publish only genuine artwork, videos, products, articles and testimonials.
2. Configure PostgreSQL, signed cloud uploads, SMTP and the optional payment provider.
3. Set the final HTTPS origin and domain.
4. Run `npm run check`.
5. Verify database backups and a restore.
6. Verify password reset, invitation, contact, commission and order flows.
7. Monitor `/api/health` for liveness, `/api/ready` for dependencies, the admin System dashboard, application logs and the configured error alert webhook.
