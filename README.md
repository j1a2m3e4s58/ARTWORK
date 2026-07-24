# Reigns Atelier

A refined, mobile-first fine-art portfolio and commission studio built with React and Vite.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Installable app

The site includes a web-app manifest, offline service worker, mobile install prompt, and custom palette icons. After deploying over HTTPS, visitors can install Reigns Atelier from the site or their browser menu.

Studio content and submissions are stored in the browser using local storage. Connect the data client in `src/api/studioClient.js` to your preferred production API when you need shared cloud data or transactional email.
