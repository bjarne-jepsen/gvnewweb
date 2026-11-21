import type { Nodes, PhrasingContent, RootContent } from 'mdast';
import { safeHref } from '../contracts/blocks';
import { slugify } from '../sync/slugs';
import { validateMarkdown } from '../sync/markdown';
import { modelMarker } from './models';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const unsupported = (node: Nodes): never => { throw new Error(`Kan ikke vise Markdown-elementet ${node.type}`); };

/** Ids the layout uses itself; a heading never takes one of them. */
const RESERVED_IDS = ['indhold', 'sidefod-genveje', 'paa-denne-side', 'genveje', 'seneste-nyt', 'soeg', 'soeg-resultater', 'soeg-status'];

/** Links to other sites open in a new tab, so the reader keeps the page they came from.
 * Screen readers hear the hint; it is hidden on screen. */
export const NEW_TAB_HINT = 'åbner i et nyt vindue';
export const NEW_TAB_ATTRS = 'target="_blank" rel="noopener noreferrer"';
export const newTabHintHtml = `<span class="visually-hidden"> (${NEW_TAB_HINT})</span>`;

/** What a link becomes: an address on the site, plain text (drop) or the link as written (undefined). */
export type LinkTarget = { path: string } | 'drop' | undefined;

/** What a "[model: …]" paragraph becomes: a sandboxed frame, or the paragraph as written (undefined). */
export type ModelEmbed = (name: string) => { src: string; title: string; caption: string } | undefined;

/** Renders the validated Markdown dialect only. Every text and attribute is escaped and any
 * node outside the dialect throws, so raw HTML can never pass through to the page.
 * linkTarget lets the caller turn links to other Google Docs into links to their pages. */
export function renderBody(body: string, isLocalImage: (url: string) => boolean, imageUrl: (url: string) => string, linkTarget: (url: string) => LinkTarget = () => undefined, model: ModelEmbed = () => undefined) {
  const tree = validateMarkdown(body, isLocalImage);
  let tables = 0;
  // Every H2 gets a stable id from its text, so the panel "På denne side" can link to it.
  const ids = new Set<string>(RESERVED_IDS);
  const text = (nodes: PhrasingContent[]): string => nodes.map(n => 'value' in n ? n.value : 'children' in n ? text(n.children) : n.type === 'image' ? '' : ' ').join('');
  const headingId = (nodes: PhrasingContent[]) => {
    const slug = slugify(text(nodes), 'x'), base = slug === 'side-x' ? 'afsnit' : slug;
    let id = base, n = 1;
    while (ids.has(id)) id = `${base}-${++n}`;
    ids.add(id);
    return id;
  };
  const img = (n: Extract<Nodes, { type: 'image' }>) => `<img src="${escape(imageUrl(n.url))}" alt="${escape(n.alt ?? '')}" loading="lazy" decoding="async">`;
  const inline = (nodes: PhrasingContent[]): string => nodes.map(n => {
    if (n.type === 'text') return escape(n.value);
    if (n.type === 'strong') return `<strong>${inline(n.children)}</strong>`;
    if (n.type === 'emphasis') return `<em>${inline(n.children)}</em>`;
    if (n.type === 'break') return '<br>';
    if (n.type === 'image') return img(n);
    if (n.type === 'link') {
      const href = safeHref(n.url); // validateMarkdown already applies the same rule; checked again here
      if (!href) throw new Error('Usikker linkprotokol');
      const target = linkTarget(href);
      if (target === 'drop') return inline(n.children);
      if (target) return `<a href="${escape(target.path)}">${inline(n.children)}</a>`;
      // mailto opens the mail program, not a page, so only web links get a new tab.
      if (href.startsWith('mailto:')) return `<a href="${escape(href)}" rel="noreferrer">${inline(n.children)}</a>`;
      return `<a href="${escape(href)}" ${NEW_TAB_ATTRS}>${inline(n.children)}${newTabHintHtml}</a>`;
    }
    return unsupported(n);
  }).join('');
  const block = (n: RootContent): string => {
    if (n.type === 'paragraph') {
      const only = n.children.length === 1 ? n.children[0]! : undefined;
      if (only?.type === 'image') return `<figure>${img(only)}</figure>`;
      const name = only?.type === 'text' ? modelMarker(only.value) : undefined, embed = name ? model(name) : undefined;
      // No allow-same-origin: the model runs in an opaque origin and cannot reach the page, cookies or storage.
      if (embed) return `<figure class="model"><iframe src="${escape(embed.src)}" title="${escape(embed.title)}" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer"></iframe><figcaption>${escape(embed.caption)}</figcaption></figure>`;
      return `<p>${inline(n.children)}</p>`;
    }
    if (n.type === 'heading') return n.depth === 2 ? `<h2 id="${headingId(n.children)}">${inline(n.children)}</h2>` : `<h${n.depth}>${inline(n.children)}</h${n.depth}>`;
    if (n.type === 'thematicBreak') return '<hr>';
    if (n.type === 'list') return `<ul>${n.children.map(item => `<li>${item.children.map(c => c.type === 'paragraph' ? inline(c.children) : block(c)).join('<br>')}</li>`).join('')}</ul>`;
    if (n.type === 'table') {
      const label = `Tabel ${++tables}`, [head, ...rows] = n.children;
      const cells = (row: typeof head, tag: 'th' | 'td') => `<tr>${row!.children.map(c => `<${tag}>${inline(c.children)}</${tag}>`).join('')}</tr>`;
      return `<div class="table-scroll" role="region" aria-label="${label}" tabindex="0"><table><thead>${cells(head, 'th')}</thead><tbody>${rows.map(r => cells(r, 'td')).join('')}</tbody></table></div>`;
    }
    return unsupported(n);
  };
  return tree.children.map(block).join('\n');
}
