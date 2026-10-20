import type { BodyBlock, Inline, TextBlock } from '../contracts/blocks';
import { mediaUrl } from '../publication/assets';
type PublicBlock = Exclude<BodyBlock, {type: 'image'}> | {type: 'image'; file: Omit<Extract<BodyBlock, {type: 'image'}>['file'], 'assetPath'>; alt: string};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
function inline(runs: Inline[]) {
  return runs.map(run => {
    let text = escape(run.text);
    if (run.bold) text = `<strong>${text}</strong>`;
    if (run.italic) text = `<em>${text}</em>`;
    if (run.href) {
      const url = new URL(run.href);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Usikker linkprotokol');
      text = `<a href="${escape(url.href)}" rel="noreferrer">${text}</a>`;
    }
    return text;
  }).join('');
}
function textBlock(block: TextBlock): string {
  if (block.type === 'paragraph') return `<p class="rich-text">${inline(block.content)}</p>`;
  if (block.type === 'list') return `<ul>${block.items.map(item => `<li class="rich-text">${inline(item)}</li>`).join('')}</ul>`;
  const level = block.level;
  if (!Number.isInteger(level) || level < 2 || level > 6) throw new Error('Ugyldigt overskriftsniveau');
  return `<h${level}>${inline(block.content)}</h${level}>`;
}
/** Only explicit, validated nodes; never render Google HTML, CSS or image URLs. */
export function renderBlocks(blocks: PublicBlock[]) {
  let tables = 0;
  return blocks.map(block => {
    if (block.type === 'image') {
      const src = mediaUrl(block.file);
      if (!/^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(src)) throw new Error('Ugyldig billedreference');
      return `<figure><a href="${src}"><img src="${src}" alt="${escape(block.alt)}" loading="lazy" decoding="async"></a></figure>`;
    }
    if (block.type === 'table') {
      const caption = `Tabel ${++tables}`;
      return `<div class="table-scroll" role="region" aria-label="${caption}" tabindex="0"><table><caption>${caption}</caption><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${cell.map(textBlock).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (block.type === 'separator') return '<hr>';
    return textBlock(block);
  }).join('\n');
}
