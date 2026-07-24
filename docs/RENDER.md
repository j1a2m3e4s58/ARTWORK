# Render testing deployment

The repository includes a Render Blueprint at `render.yaml`. Create a new
Blueprint in Render, connect the GitHub repository, and select the `main`
branch.

## Values Render will request

Enter these values during the first Blueprint creation:

- `APP_ORIGIN` and `SITE_URL`: the final HTTPS Render URL, for example
  `https://reigns-atelier.onrender.com`. If Render assigns a suffixed hostname,
  update both values to the exact URL and redeploy.
- `ADMIN_EMAIL`: the initial administrator email address.
- `ADMIN_PASSWORD`: a unique strong administrator password.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
  `CLOUDINARY_API_SECRET`: signed Cloudinary credentials.
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and `EMAIL_REPLY_TO`:
  production-capable email delivery settings. Adjust `SMTP_PORT` and
  `SMTP_SECURE` after creation if the provider requires different values.
- `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY`: keys created for the
  Render hostname in Cloudflare Turnstile.

Do not put any of these secret values in Git.

## Provisioned configuration

The Blueprint creates:

- one Node web service;
- one PostgreSQL database connected through `DATABASE_URL`;
- `/api/ready` as the deployment health check;
- Cloudinary as the required persistent media provider;
- generated JWT and metrics secrets;
- trusted proxy handling;
- manual GHS payments for the initial test.

The application creates and upgrades its relational schema during startup.
Render only marks the release healthy when PostgreSQL, SMTP, Cloudinary,
Turnstile, and the public origins are configured successfully.

## First-release verification

After the deployment becomes live:

1. Open `/api/health` and confirm the database reports `postgresql`.
2. Open `/api/ready` and confirm `ok` is `true`.
3. Sign in with the initial administrator account and complete MFA setup.
4. Test registration, email verification, contact messages, media upload, and
   an order using manual payment.
5. Remove `ADMIN_PASSWORD` from the service environment after the initial
   administrator has been created and MFA is working.
6. Replace `APP_ORIGIN` and `SITE_URL` with the custom HTTPS domain before
   switching domains.

For Paystack testing later, change `PAYMENT_PROVIDER` to `paystack`, add the
test public and secret keys, then configure the webhook:

`https://YOUR_DOMAIN/api/payments/webhook`
