import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { digest, type ContentRecord } from '../lib/contracts/content';
import { recordUrl, type PublicRecord } from '../lib/publication/store';
export async function walk(root: string): Promise<string[]> {
  const results: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const path = join(root, e.name);
    if (e.isSymbolicLink()) throw new Error(`Symlink i output: ${path}`);
    if (e.isDirectory()) results.push(...await walk(path)); else results.push(path);
  }
  return results;
}
export async function verifyOutput(root: string, records: PublicRecord[], assets: Map<string, Uint8Array>, candidates: ContentRecord[]) {
  const pages = ['index.html', ...['dokumenter', 'vejledninger', 'opslag', 'kalender'].map(x => `${x}/index.html`), ...records.map(r => `${recordUrl(r).slice(1)}index.html`)];
  const allowed = new Set([...pages, 'search.json', 'sitemap.xml', ...assets.keys()].map(x => x.replace(/^\//, '')));
  const paths = await walk(root), found = new Set<string>();
  const selected = new Set(records.map(r => r.id));
  const approvedText = JSON.stringify(records);
  // Titles/filenames can legitimately be shared by a withdrawn candidate and an
  // approved record. Exact approved payloads and the asset allowlist are authoritative.
  const forbidden = candidates.filter(r => !selected.has(r.id)).flatMap(r => [r.id, r.title, ...(r.type === 'document' ? [r.file.originalFilename] : [])]).filter(token => !approvedText.includes(token));
  for (const path of paths) {
    const rel = relative(root, path); found.add(rel);
    if (!allowed.has(rel) && !/^_astro\/[a-zA-Z0-9_.-]+\.css$/.test(rel)) throw new Error(`Uventet outputfil: ${rel}`);
    const bytes = await readFile(path);
    if (assets.has(`/${rel}`) && digest(bytes) !== digest(assets.get(`/${rel}`)!)) throw new Error(`Forkert offentlig asset: ${rel}`);
    const text = bytes.toString();
    for (const token of [...forbidden, 'sourceId', 'sourceRevision', 'assetPath', 'approvedBy', 'MEMBERS_ONLY_CANARY', 'BOARD_ONLY_CANARY', 'UNAPPROVED_CANARY']) {
      if (token && text.includes(token)) throw new Error(`Ikke-offentligt felt/indhold i ${rel}: ${token}`);
    }
  }
  for (const path of allowed) if (!found.has(path)) throw new Error(`Forventet output mangler: ${path}`);
  const search = JSON.parse(await readFile(join(root, 'search.json'), 'utf8')) as { url: string }[];
  const urls = records.map(recordUrl).sort();
  if (JSON.stringify(search.map(x => x.url).sort()) !== JSON.stringify(urls)) throw new Error('Søgeindeks afviger fra offentlige records');
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  for (const url of urls) if (!sitemap.includes(`https://example.invalid${url}</loc>`)) throw new Error(`Sitemap mangler ${url}`);
}
