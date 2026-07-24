# Reigns Atelier

A mobile-first fine-art portfolio, commission studio, shop, content manager, and installable web app.

## Local development

1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET`, administrator email, and administrator password.
3. Install and run:

```bash
npm install
npm run dev
```

The web app runs at `http://127.0.0.1:43127` and the API at `http://127.0.0.1:43130`.

## Security and persistence

- Passwords are hashed with bcrypt.
- Sessions use signed HTTP-only cookies.
- Admin routes and mutations are authorized by the API.
- Login endpoints are rate-limited.
- Security headers are enabled.
- Local data is stored server-side under `server/data/` and uploads under `server/uploads/`; both are excluded from Git.
- For multi-instance production deployment, replace the JSON database adapter in `server/db.js` with PostgreSQL.

## Email

Password-reset links, user invitations, commission confirmations, and inbox replies use SMTP when configured:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
```

Without SMTP, messages and replies remain recorded in the admin portal with delivery status `smtp_not_configured`.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

Set `API_HOST=0.0.0.0`, `APP_ORIGIN` to the HTTPS site URL, and use secure production secrets. The server hosts the built frontend and API together.
