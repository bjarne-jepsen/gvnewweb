import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siteConfigSchema } from '../sync/config';
import { guideMetaSchema, localImage, newsMetaSchema } from '../sync/content';
import { docIdOf, FRONTPAGE_FILE, frontpageSchema } from '../sync/frontpage';
import { parseMarkdown, splitFrontmatter } from '../sync/markdown';
import { manualRedirectsSchema } from '../sync/sections';
import { pathOf } from '../sync/slugs';
import { readContent } from '../sync/sync';
import { renderBody, type LinkTarget } from './render';
import { copenhagenDay, frontpage } from './sections';

/** intro: plain paragraphs separated by a blank line, from the folder's _intro document. */
export interface SiteSection { key: string; order: number; label: string; intro: string; path: string; news: boolean }
/** search: what the search index gets beyond title and summary. Plain text only, from the same public body. */
export interface SearchText { headings: string[]; text: string; keywords: string[] }
interface ItemBase { id: string; section: string; slug: string; path: string; title: string; updatedAt: string; search: SearchText }
export type SiteItem = ItemBase & ({ kind: 'page'; summary: string; html: string; image?: SiteImage } | { kind: 'notice'; summary: string; html: string; date: string; expires?: string });
/** The picture on a page's tile on the section's landing page: the first image in the document. */
export interface SiteImage { src: string; alt: string }
export interface SiteRedirect { from: string; to: string }
/** A front-page shortcut or footer link. Internal links always point at a page that exists. */
export interface SiteLink { id: string; group: 'shortcut' | 'footer'; order: number; label: string; href: string; external: boolean }
export interface Site { frontpage: { intro: string }; sections: SiteSection[]; items: SiteItem[]; redirects: SiteRedirect[]; links: SiteLink[]; assets: Map<string, Uint8Array>; warnings: string[]; internalIds: string[]; buildDay: string; origin: string }

export { manualRedirectsSchema };
const collator = new Intl.Collator('da-DK');

/** The one public dataset: pages, files, sitemap and search index are all derived from it.
 * News is filtered here, at build time: shown from its date through its expiry day (Copenhagen). */
export async function loadSite(root = '.', buildAt = new Date(process.env.BUILD_AT ?? Date.now())): Promise<Site> {
  if (Number.isNaN(buildAt.getTime())) throw new Error('BUILD_AT er ikke et gyldigt tidspunkt');
  const buildDay = copenhagenDay(buildAt);
  const config = siteConfigSchema.parse(JSON.parse(await readFile(join(root, 'config/site.json'), 'utf8')));
  const contentDir = join(root, 'content');
  const { entries, slugs, sections: known } = await readContent(contentDir);
  // Menu order is the number in front of the folder name. A page section without pages is not shown;
  // a news section is, also when no news is current.
  const used = new Set([...entries.values()].map(e => e.section));
  const sections: SiteSection[] = known.filter(s => s.kind === 'notice' || used.has(s.key))
    .sort((a, b) => a.order - b.order || collator.compare(a.label, b.label) || (a.key < b.key ? -1 : 1))
    .map((s, order) => ({ key: s.key, order, label: s.label, intro: s.intro, path: `/${s.key}/`, news: s.kind === 'notice' }));
  const items: SiteItem[] = [], assets = new Map<string, Uint8Array>(), warnings: string[] = [];
  const newsMeta = (entry: { id: string; files: Map<string, Uint8Array> }) => newsMetaSchema.parse(JSON.parse(Buffer.from(entry.files.get(`${entry.id}.json`)!).toString('utf8')));
  const shown = (meta: { date: string; expires?: string | undefined }) => !(meta.date > buildDay || (meta.expires && meta.expires < buildDay));
  // Editors link between documents with ordinary Google Docs links. Such a link points at the document's
  // page; a link to a document that is not shown on the site becomes plain text. Either way no Drive ID
  // reaches the page.
  const pathOfDoc = new Map<string, string>();
  for (const entry of entries.values()) {
    const slug = slugs[entry.id];
    if (slug && (entry.kind !== 'notice' || shown(newsMeta(entry)))) pathOfDoc.set(entry.id, pathOf(slug));
  }
  const linkTarget = (title: string) => (url: string): LinkTarget => {
    const id = docIdOf(url);
    if (!id) return undefined;
    const path = pathOfDoc.get(id);
    if (path) return { path };
    warnings.push(`${title}: et link til et Google-dokument, der ikke er en side på hjemmesiden, vises som almindelig tekst`);
    return 'drop';
  };
  for (const entry of entries.values()) {
    const slug = slugs[entry.id];
    if (!slug || slug.section !== entry.section) throw new Error(`content/_slugs.json: ${entry.id} mangler eller peger på en anden sektion`);
    const path = pathOf(slug), common = { id: entry.id, section: entry.section, slug: slug.slug, path, title: entry.title, updatedAt: entry.updatedAt };
    if (entry.kind === 'notice') {
      const meta = newsMeta(entry);
      if (!shown(meta)) continue;
      const base = { ...common, search: searchText(meta.body, meta.keywords ?? []) };
      const html = renderBody(meta.body, () => false, () => { throw new Error('Nyheder kan ikke have billeder'); }, linkTarget(entry.title));
      items.push({ ...base, kind: 'notice', summary: meta.summary, html, date: meta.date, ...(meta.expires ? { expires: meta.expires } : {}) });
    } else {
      const { meta, body } = splitFrontmatter(Buffer.from(entry.files.get(`${entry.id}.md`)!).toString('utf8'));
      const front = guideMetaSchema.parse(meta);
      const base = { ...common, search: searchText(body, front.keywords ?? []) };
      for (const [name, bytes] of entry.files) if (name.startsWith(`${entry.id}/`)) assets.set(`${path}${name.slice(entry.id.length + 1)}`, bytes);
      const isLocal = localImage(entry.id), imageUrl = (url: string) => `${path}${url.slice(entry.id.length + 3)}`;
      const html = renderBody(body, isLocal, imageUrl, linkTarget(entry.title));
      const image = firstImage(body, isLocal);
      items.push({ ...base, kind: 'page', summary: front.summary, html, ...(image ? { image: { src: imageUrl(image.url), alt: image.alt } } : {}) });
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
  const redirects: SiteRedirect[] = [], links: SiteLink[] = [];
  // The _forside document decides the front page; without it the built-in defaults are used.
  const fromDrive = await readFile(join(contentDir, FRONTPAGE_FILE), 'utf8').then(raw => frontpageSchema.parse(JSON.parse(raw)), error => { if (error.code === 'ENOENT') return undefined; throw error; });
  const pathOfId = new Map(items.filter(i => i.kind === 'page').map(i => [i.id, i.path]));
  const shortcuts = fromDrive ? fromDrive.shortcuts.flatMap(s => {
    const path = pathOfId.get(s.id);
    if (!path) warnings.push(`Forsiden: "${s.label}" springes over, fordi dokumentet ikke er en side på hjemmesiden`);
    return path ? [{ label: s.label, path }] : [];
  }) : frontpage.shortcuts;
  const intro = fromDrive ? fromDrive.intro : frontpage.intro;
  for (const [group, where, list] of [['shortcut', 'Forsiden', shortcuts], ['footer', 'Sidefoden', frontpage.footer]] as const) list.forEach((link, order) => {
    if (live.has(link.path)) links.push({ id: `${group}-${order}`, group, order, label: link.label, href: link.path, external: false });
    else warnings.push(`${where}: "${link.label}" → ${link.path} springes over, fordi siden ikke findes`);
  });
  if (config.links.probo) links.push({ id: 'footer-probo', group: 'footer', order: frontpage.footer.length, label: 'Dokumenter i ProBo', href: config.links.probo, external: true });
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
  // Drive IDs must never reach the output. News items are Google documents too.
  const internalIds = [...entries.values()].map(e => e.id);
  return { frontpage: { intro }, sections, items, redirects, links, assets, warnings, internalIds, buildDay, origin: new URL(config.siteUrl).origin };
}

/** Headings and running text of a Markdown body, for the search index. Image alt text is left out. */
function searchText(body: string, keywords: string[]): SearchText {
  type Node = { type: string; value?: string; children?: Node[] };
  const inline = new Set(['paragraph', 'heading', 'tableCell', 'strong', 'emphasis', 'link']);
  const text = (n: Node): string => n.type === 'text' ? n.value! : n.type === 'break' ? ' ' : (n.children ?? []).map(text).join(inline.has(n.type) ? '' : ' ');
  const root = parseMarkdown(body) as Node, headings: string[] = [], parts: string[] = [];
  for (const block of root.children ?? []) (block.type === 'heading' ? headings : parts).push(text(block).replace(/\s+/g, ' ').trim());
  return { headings: headings.filter(Boolean), text: parts.filter(Boolean).join(' '), keywords };
}

/** The first local image with alt text in a page's Markdown, in document order. */
function firstImage(body: string, isLocal: (url: string) => boolean): { url: string; alt: string } | undefined {
  type Node = { type: string; url?: string; alt?: string | null; children?: Node[] };
  const find = (n: Node): { url: string; alt: string } | undefined => {
    if (n.type === 'image' && n.url && isLocal(n.url) && n.alt?.trim()) return { url: n.url, alt: n.alt.trim() };
    for (const c of n.children ?? []) { const hit = find(c); if (hit) return hit; }
    return undefined;
  };
  return find(parseMarkdown(body) as Node);
}
