import { writeFile } from 'node:fs/promises';

const base = (process.env.SITE_URL || process.env.APP_ORIGIN || 'http://127.0.0.1:43127').replace(/\/$/, '');
const routes = ['/', '/gallery', '/commission', '/videos', '/about', '/contact', '/privacy', '/terms'];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(route => `  <url><loc>${base}${route}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml);
