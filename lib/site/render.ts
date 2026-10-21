import type { Nodes, PhrasingContent, RootContent } from 'mdast';
import { validateMarkdown } from '../sync/markdown';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const unsupported = (node: Nodes): never => { throw new Error(`Kan ikke vise Markdown-elementet ${node.type}`); };

/** Renders the validated Markdown dialect only. Every text and attribute is escaped and any
 * node outside the dialect throws, so raw HTML can never pass through to the page. */
export function renderBody(body: string, isLocalImage: (url: string) => boolean, imageUrl: (url: string) => string) {
  const tree = validateMarkdown(body, isLocalImage);
  let tables = 0;
  const img = (n: Extract<Nodes, { type: 'image' }>) => `<img src="${escape(imageUrl(n.url))}" alt="${escape(n.alt ?? '')}" loading="lazy" decoding="async">`;
  const inline = (nodes: PhrasingContent[]): string => nodes.map(n => {
    if (n.type === 'text') return escape(n.value);
    if (n.type === 'strong') return `<strong>${inline(n.children)}</strong>`;
    if (n.type === 'emphasis') return `<em>${inline(n.children)}</em>`;
    if (n.type === 'break') return '<br>';
    if (n.type === 'image') return img(n);
    if (n.type === 'link') {
      const url = new URL(n.url); // validateMarkdown already allows http(s) only; checked again here
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Usikker linkprotokol');
      return `<a href="${escape(url.href)}" rel="noreferrer">${inline(n.children)}</a>`;
    }
    return unsupported(n);
  }).join('');
  const block = (n: RootContent): string => {
    if (n.type === 'paragraph') return n.children.length === 1 && n.children[0]!.type === 'image' ? `<figure>${img(n.children[0]!)}</figure>` : `<p>${inline(n.children)}</p>`;
    if (n.type === 'heading') return `<h${n.depth}>${inline(n.children)}</h${n.depth}>`;
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
