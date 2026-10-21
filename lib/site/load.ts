import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { siteConfigSchema } from '../sync/config';
import { documentMetaSchema, guideMetaSchema, localImage, newsMetaSchema } from '../sync/content';
import { splitFrontmatter } from '../sync/markdown';
import { pathOf } from '../sync/slugs';
import { readContent, syncedSections } from '../sync/sync';
import { renderBody } from './render';
import { copenhagenDay, sectionTexts } from './sections';

export interface SiteSection { key: string; order: number; label: string; intro: string; path: string }
interface ItemBase { id: string; section: string; slug: string; path: string; title: string; updatedAt: string }
export type SiteItem = ItemBase & ({ kind: 'page'; summary: string; html: string } | { kind: 'document'; summary: string; download: string; sizeBytes: number }
  | { kind: 'notice'; summary: string; html: string; date: string; expires?: string });
export interface SiteRedirect { from: string; to: string }
export interface Site { sections: SiteSection[]; items: SiteItem[]; redirects: SiteRedirect[]; assets: Map<string, Uint8Array>; warnings: string[]; internalIds: string[]; buildDay: string }

// Manual redirects, e.g. from old WordPress URLs. Directory-style paths only.
const redirectPath = z.string().regex(/^\/(?:[a-zA-Z0-9._~-]+\/)+$/).refine(p => !p.split('/').some(s => s === '.' || s === '..'));
const manualRedirectsSchema = z.record(redirectPath, redirectPath);
const collator = new Intl.Collator('da-DK');

/** The one public dataset: pages, files, sitemap and search index are all derived from it.
 * News is filtered here, at build time: shown from its date through its expiry day (Copenhagen). */
export async function loadSite(root = '.', buildAt = new Date(process.env.BUILD_AT ?? Date.now())): Promise<Site> {
  if (Number.isNaN(buildAt.getTime())) throw new Error('BUILD_AT er ikke et gyldigt tidspunkt');
  const buildDay = copenhagenDay(buildAt);
  const config = siteConfigSchema.parse(JSON.parse(await readFile(join(root, 'config/site.json'), 'utf8')));
  const contentDir = join(root, 'content');
  const { entries, slugs } = await readContent(contentDir, config);
  const sections = [...syncedSections(config).keys()].map((key, order) => {
    const text = sectionTexts[key];
    if (!text) throw new Error(`Sektionen ${key} mangler tekst og navigation i lib/site/sections.ts`);
    return { key, order, ...text, path: `/${key}/` };
  });
  const items: SiteItem[] = [], assets = new Map<string, Uint8Array>();
  for (const entry of entries.values()) {
    const slug = slugs[entry.id];
    if (!slug || slug.section !== entry.section) throw new Error(`content/_slugs.json: ${entry.id} mangler eller peger på en anden sektion`);
    const path = pathOf(slug), base = { id: entry.id, section: entry.section, slug: slug.slug, path, title: entry.title, updatedAt: entry.updatedAt };
    if (entry.kind === 'pdf') {
      const meta = documentMetaSchema.parse(JSON.parse(Buffer.from(entry.files.get(`${entry.id}.json`)!).toString('utf8')));
      const download = `/${entry.section}/${slug.slug}.pdf`;
      assets.set(download, entry.files.get(`${entry.id}.pdf`)!);
      items.push({ ...base, kind: 'document', summary: '', download, sizeBytes: meta.sizeBytes });
    } else if (entry.kind === 'notice') {
      const meta = newsMetaSchema.parse(JSON.parse(Buffer.from(entry.files.get(`${entry.id}.json`)!).toString('utf8')));
      if (meta.date > buildDay || (meta.expires && meta.expires < buildDay)) continue;
      const html = renderBody(meta.body, () => false, () => { throw new Error('Nyheder kan ikke have billeder'); });
      items.push({ ...base, kind: 'notice', summary: meta.summary, html, date: meta.date, ...(meta.expires ? { expires: meta.expires } : {}) });
    } else {
      const { meta, body } = splitFrontmatter(Buffer.from(entry.files.get(`${entry.id}.md`)!).toString('utf8'));
      const front = guideMetaSchema.parse(meta);
      for (const [name, bytes] of entry.files) if (name.startsWith(`${entry.id}/`)) assets.set(`${path}${name.slice(entry.id.length + 1)}`, bytes);
      const html = renderBody(body, localImage(entry.id), url => `${path}${url.slice(entry.id.length + 3)}`);
      items.push({ ...base, kind: 'page', summary: front.summary, html });
    }
  }
  // News newest first, everything else alphabetically; a total order, so builds are deterministic.
  const newsFirst = (a: SiteItem, b: SiteItem) => a.kind === 'notice' && b.kind === 'notice' ? (b.date < a.date ? -1 : b.date > a.date ? 1 : 0) : a.kind === 'notice' ? -1 : b.kind === 'notice' ? 1 : 0;
  items.sort((a, b) => newsFirst(a, b) || collator.compare(a.title, b.title) || (a.path < b.path ? -1 : 1));

  const live = new Set(['/', ...sections.map(s => s.path)]);
  for (const item of items) {
    if (live.has(item.path)) throw new Error(`${item.path} bruges af flere sider`);
    live.add(item.path);
  }
  const warnings: string[] = [], redirects: SiteRedirect[] = [];
  for (const item of items) for (const from of slugs[item.id]!.previousPaths) redirects.push({ from, to: item.path });
  const manual = manualRedirectsSchema.parse(JSON.parse(await readFile(join(contentDir, '_redirects.json'), 'utf8').catch(() => '{}')));
  for (const [from, to] of Object.entries(manual)) {
    if (live.has(to)) redirects.push({ from, to }); else warnings.push(`_redirects.json: ${from} → ${to} springes over, fordi ${to} ikke findes`);
  }
  const sources = new Set<string>();
  for (const { from } of redirects) {
    // A redirect may never shadow a live page or file, and each old path has one target.
    if (live.has(from) || sources.has(from) || [...assets.keys()].some(a => a.startsWith(from))) throw new Error(`Redirect fra ${from} rammer en eksisterende side, fil eller et andet redirect`);
    sources.add(from);
  }
  redirects.sort((a, b) => a.from < b.from ? -1 : 1);
  // Drive IDs must never reach the output; news IDs are editor-facing and not secret.
  const internalIds = [...entries.values()].filter(e => e.kind !== 'notice').map(e => e.id);
  return { sections, items, redirects, assets, warnings, internalIds, buildDay };
}
