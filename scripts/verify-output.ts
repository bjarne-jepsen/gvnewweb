import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { digest } from '../lib/sync/content';
import type { Site } from '../lib/site/load';
export async function walk(root: string): Promise<string[]> {
  const results: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const path = join(root, e.name);
    if (e.isSymbolicLink()) throw new Error(`Symlink i output: ${path}`);
    if (e.isDirectory()) results.push(...await walk(path)); else results.push(path);
  }
  return results;
}
const pageFile = (path: string) => `${path.slice(1)}index.html`;
/** Default deny: dist may contain exactly the pages, files and indexes derived from content/. */
export async function verifyOutput(root: string, site: Site) {
  const pages = ['/', ...site.sections.map(s => s.path), ...site.items.map(i => i.path)].map(pageFile);
  const redirects = new Map(site.redirects.map(r => [pageFile(r.from), r.to]));
  const allowed = new Set([...pages, ...redirects.keys(), 'search.json', 'sitemap.xml', ...[...site.assets.keys()].map(u => u.slice(1))]);
  const found = new Set<string>();
  for (const path of await walk(root)) {
    const rel = relative(root, path); found.add(rel);
    if (!allowed.has(rel) && !/^_astro\/[a-zA-Z0-9_.-]+\.css$/.test(rel)) throw new Error(`Uventet outputfil: ${rel}`);
    const bytes = await readFile(path), asset = site.assets.get(`/${rel}`);
    if (asset) { if (digest(bytes) !== digest(asset)) throw new Error(`Offentlig fil afviger fra content/: ${rel}`); continue; }
    const text = bytes.toString('utf8');
    // Drive IDs are internal identifiers and never needed in public output.
    for (const id of site.internalIds) if (text.includes(id)) throw new Error(`Internt Drive-ID i ${rel}`);
    if (rel.endsWith('.html') && /<script/i.test(text)) throw new Error(`Script i ${rel}`);
    const to = redirects.get(rel);
    if (to && !text.includes(`url=${to}"`)) throw new Error(`Redirect-siden ${rel} peger ikke på ${to}`);
  }
  for (const path of allowed) if (!found.has(path)) throw new Error(`Forventet output mangler: ${path}`);
  const search = JSON.parse(await readFile(join(root, 'search.json'), 'utf8')) as { url: string }[];
  const urls = site.items.map(i => i.path).sort();
  if (JSON.stringify(search.map(x => x.url).sort()) !== JSON.stringify(urls)) throw new Error('Søgeindeks afviger fra de offentlige sider');
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/<loc>https:\/\/example\.invalid([^<]*)<\/loc>/g)].map(m => m[1]!).sort();
  if (JSON.stringify(listed) !== JSON.stringify(['/', ...site.sections.map(s => s.path), ...urls].sort())) throw new Error('Sitemap afviger fra de offentlige sider');
}
