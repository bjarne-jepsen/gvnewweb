import { getCollection } from 'astro:content';
import { loadSite } from '../../lib/site/load';
// The origin is siteUrl in config/site.json. Redirects are not listed.
export const GET = async () => {
  const { origin } = await loadSite();
  const paths = ['/', ...(await getCollection('sections')).map(s => s.data.path), ...(await getCollection('items')).map(i => i.data.path)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
};
