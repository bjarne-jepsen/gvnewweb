import { records, url, sections } from '../../lib/site/content';
// Origin intentionally deferred until the real hosting/domain decision.
export const GET = () => new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', ...Object.values(sections).map(s => `/${s}/`), ...records.map(url)].map(path => `<url><loc>https://example.invalid${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
