import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import type { Nodes, Root } from 'mdast';
import type { BodyBlock, Inline, TextBlock } from '../contracts/blocks';

/** A block whose image already has its final, document-local file name. */
export type SerializableBlock = Exclude<BodyBlock, { type: 'image' }> | { type: 'image'; alt: string; name: string };

// Escape everything CommonMark/GFM could read as syntax. Over-escaping is harmless; under-escaping is not.
const escapeText = (s: string) => s.replace(/[\\`*_[\]<>|~&#]/g, '\\$&')
  .replace(/(^|\n)[ \t]+/g, '$1')            // leading indentation could start a code block
  .replace(/(^|\n)([-+=])/g, '$1\\$2')        // list markers and setext underlines
  .replace(/(^|\n)(\d+)([.)])/g, '$1$2\\$3'); // ordered-list markers
const escapeUrl = (href: string) => new URL(href).href.replace(/[()<> ]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const punct = /[\p{P}\p{S}]/u, space = /\s/;
const loose = (c: string | undefined) => !c || space.test(c) || punct.test(c);

function renderRuns(runs: Inline[]) {
  // Merge neighbours with identical styling so delimiters never meet ("**a****b**").
  const merged: Inline[] = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    if (prev && !!prev.bold === !!run.bold && !!prev.italic === !!run.italic && prev.href === run.href) prev.text += run.text;
    else if (run.text) merged.push({ ...run });
  }
  const styled = (run: Inline, before: string | undefined, after: string | undefined) => {
    const text = run.text.replace(/[ \t]+\n/g, '\n').replace(/\t/g, ' ');
    const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
    if (!core) return text;
    let out = escapeText(core);
    // CommonMark flanking rules: "*"x"*y" cannot close. In that rare case the emphasis is dropped,
    // never turned into literal asterisks.
    const opens = !punct.test(core[0]!) || loose(lead ? lead.at(-1) : before);
    const closes = !punct.test(core.at(-1)!) || loose(trail ? trail[0] : after);
    if (opens && closes) {
      if (run.italic) out = `*${out}*`;
      if (run.bold) out = `**${out}**`;
    }
    return lead + out + trail; // whitespace outside the delimiters keeps them flanking
  };
  let out = '';
  for (let i = 0; i < merged.length;) {
    const href = merged[i]!.href;
    let j = i, inner = '';
    while (j < merged.length && merged[j]!.href === href) {
      // At a link edge the neighbouring character is the bracket or parenthesis of the link syntax.
      const prev = merged[j - 1], next = merged[j + 1];
      const before = j > i ? prev!.text.at(-1) : href ? '[' : prev ? ')' : undefined;
      const after = next && next.href === href ? next.text[0] : href ? ']' : next ? '[' : undefined;
      inner += styled(merged[j]!, before, after); j++;
    }
    out += href ? `[${inner}](${escapeUrl(href)})` : inner;
    i = j;
  }
  return out.replace(/^\s+|\s+$/g, '').replace(/\n[ \t]+/g, '\n').replace(/\n/g, '\\\n');
}
const oneLine = (runs: Inline[]) => renderRuns(runs.map(r => ({ ...r, text: r.text.replace(/\n/g, ' ') })));
const plain = (runs: Inline[]) => runs.map(r => r.text).join('');

function cellText(blocks: TextBlock[]) {
  return blocks.map(b => b.type === 'list' ? b.items.map(item => `• ${oneLine(item)}`).join(' · ') : oneLine(b.content)).filter(Boolean).join(' · ');
}
/** One-row tables are layout boxes in practice: they become ordinary blocks. */
export function flattenBlocks(blocks: SerializableBlock[]): SerializableBlock[] {
  return blocks.flatMap(b => b.type === 'table' && b.rows.length === 1 ? b.rows[0]!.flat() : [b]);
}
export function blocksToMarkdown(input: SerializableBlock[], imagePath: (name: string) => string) {
  let bullet = '*';
  return flattenBlocks(input).map((b, index, all) => {
    if (b.type === 'heading') return `${'#'.repeat(b.level)} ${oneLine(b.content)}`;
    if (b.type === 'paragraph') return renderRuns(b.content);
    if (b.type === 'separator') return '---';
    if (b.type === 'image') return `![${escapeText(b.alt.replace(/\s+/g, ' ').trim())}](${imagePath(b.name)})`;
    if (b.type === 'list') {
      // Alternate the marker so two neighbouring lists are not merged into one.
      bullet = all[index - 1]?.type === 'list' && bullet === '-' ? '*' : '-';
      return b.items.map(item => `${bullet} ${renderRuns(item).replace(/\n/g, '\n  ')}`).join('\n');
    }
    const [head, ...rows] = b.rows.map(row => `| ${row.map(cellText).join(' | ')} |`);
    return [head, `|${' --- |'.repeat(b.rows[0]!.length)}`, ...rows].join('\n');
  }).filter(Boolean).join('\n\n') + '\n';
}

export function summaryOf(blocks: SerializableBlock[], max = 300) {
  const first = flattenBlocks(blocks).find(b => b.type === 'paragraph' && plain(b.content).trim());
  const text = first?.type === 'paragraph' ? plain(first.content).replace(/\s+/g, ' ').trim() : '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1), space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export const parseMarkdown = (md: string): Root => fromMarkdown(md, { extensions: [gfmTable()], mdastExtensions: [gfmTableFromMarkdown()] });
const allowed = new Set(['root', 'paragraph', 'heading', 'text', 'strong', 'emphasis', 'break', 'link', 'list', 'listItem', 'thematicBreak', 'table', 'tableRow', 'tableCell', 'image']);
/** Allowlist validation of a Markdown body. Throws on anything outside the supported dialect. */
export function validateMarkdown(md: string, isLocalImage: (url: string) => boolean) {
  const problems = new Set<string>();
  const walk = (node: Nodes) => {
    if (!allowed.has(node.type)) problems.add(node.type);
    if (node.type === 'heading' && node.depth < 2) problems.add('heading-1');
    if (node.type === 'list' && node.ordered) problems.add('ordered-list');
    if (node.type === 'link' && !/^https?:$/.test((() => { try { return new URL(node.url).protocol; } catch { return ''; } })())) problems.add(`link:${node.url.slice(0, 40)}`);
    if (node.type === 'image' && (!isLocalImage(node.url) || !node.alt?.trim())) problems.add(`image:${node.url.slice(0, 40)}`);
    if ('children' in node) node.children.forEach(child => walk(child as Nodes));
  };
  const tree = parseMarkdown(md);
  walk(tree);
  if (problems.size) throw new Error(`Markdown indeholder ikke-tilladte elementer: ${[...problems].join(', ')}`);
  return tree;
}

const squash = (s: string) => s.replace(/[•·]/g, ' ').replace(/\s+/g, ' ').trim();
function mdText(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'break') return ' ';
  if (node.type === 'image') return ` ${node.alt ?? ''} `;
  const inline = ['paragraph', 'heading', 'strong', 'emphasis', 'link', 'tableCell'].includes(node.type);
  return 'children' in node ? node.children.map(c => mdText(c as Nodes)).join(inline ? '' : ' ') : '';
}
function blockText(b: SerializableBlock): string {
  if (b.type === 'image') return ` ${b.alt} `;
  if (b.type === 'separator') return '';
  if (b.type === 'table') return b.rows.flat(2).map(blockText).join(' ');
  if (b.type === 'list') return b.items.map(plain).join(' ');
  return plain(b.content);
}
/** Fail closed if serialization lost or invented text (e.g. a delimiter that did not close). */
export function assertRoundTrip(blocks: SerializableBlock[], tree: Root) {
  const expected = squash(blocks.map(blockText).join(' ')), actual = squash(mdText(tree));
  if (expected !== actual) throw new Error('Markdown-konverteringen ændrede teksten; dokumentet publiceres ikke');
}

const frontKeys = ['id', 'title', 'updatedAt', 'summary'] as const;
/** JSON values are valid YAML scalars, so Astro's frontmatter parser reads the same data. */
export function withFrontmatter(meta: Record<(typeof frontKeys)[number], string>, body: string) {
  return `---\n${frontKeys.map(k => `${k}: ${JSON.stringify(meta[k])}`).join('\n')}\n---\n\n${body}`;
}
export function splitFrontmatter(source: string) {
  const match = /^---\n([\s\S]*?)\n---\n\n/.exec(source);
  if (!match) throw new Error('Frontmatter mangler');
  const meta: Record<string, unknown> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = /^([a-zA-Z]+): (.*)$/.exec(line);
    if (!kv) throw new Error(`Ugyldig frontmatter-linje: ${line.slice(0, 40)}`);
    meta[kv[1]!] = JSON.parse(kv[2]!);
  }
  return { meta, body: source.slice(match[0].length) };
}
