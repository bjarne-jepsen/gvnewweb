const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function inline(source: string) {
  let html = '', offset = 0;
  for (const match of source.matchAll(/\[([^\]\n]+)\]\(([^\s()]+)\)/g)) {
    html += escape(source.slice(offset, match.index));
    const href = match[2]!;
    // Defence in depth: rendering never trusts Markdown validation alone.
    try {
      const parsed = new URL(href);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
      html += `<a href="${escape(parsed.href)}" rel="noreferrer">${escape(match[1]!)}</a>`;
    } catch { html += escape(match[0]); }
    offset = match.index! + match[0].length;
  }
  return html + escape(source.slice(offset));
}
/** Deliberately small presentation dialect: headings, paragraphs, lists, links.
 * No raw HTML, images, reference links, embedded scripts or third-party parser. */
export function renderMarkdown(source: string) {
  return source.split(/\n\s*\n/).map(block => {
    const heading = /^(#{1,6})\s+([^\n]+)$/.exec(block);
    if (heading) { const level = Math.max(2, heading[1]!.length); return `<h${level}>${inline(heading[2]!)}</h${level}>`; }
    const lines = block.split('\n');
    if (lines.every(line => /^[-*] /.test(line))) return `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${inline(block).replace(/\n/g, ' ')}</p>`;
  }).join('\n');
}
