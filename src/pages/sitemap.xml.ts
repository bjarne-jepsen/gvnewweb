import { getCollection } from 'astro:content';
// Origin intentionally deferred until the real hosting/domain decision. Redirects are not listed.
export const GET = async () => {
  const paths = ['/', ...(await getCollection('sections')).map(s => s.data.path), ...(await getCollection('items')).map(i => i.data.path)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>https://example.invalid${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
};
