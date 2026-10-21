import { describe, expect, test } from 'bun:test';
import { assertRoundTrip, blocksToMarkdown, splitFrontmatter, summaryOf, validateMarkdown, withFrontmatter, type SerializableBlock } from '../lib/sync/markdown';

const p = (text: string, extra: object = {}) => ({ type: 'paragraph' as const, content: [{ text, ...extra }] });
const md = (blocks: SerializableBlock[]) => blocksToMarkdown(blocks, name => `./doc1/${name}`);
const local = (url: string) => url.startsWith('./doc1/');
const roundTrip = (blocks: SerializableBlock[]) => { const tree = validateMarkdown(md(blocks), local); assertRoundTrip(blocks, tree); return tree; };

describe('Markdown-serializer', () => {
  test('bevarer al tekst med Markdown-tegn, HTML og entiteter som ren tekst', () => {
    const tricky = 'x & &amp; <script>alert(1)</script> | ~a~ \\ [x](y) *ikke fed* _ikke kursiv_ `kode`\n# ikke overskrift\n- ikke liste\n1. ikke nummer\n===\n    indrykket';
    const tree = roundTrip([{ type: 'heading', level: 2, content: [{ text: 'Afsnit # 1 *vigtigt* #' }] }, p(tricky)]);
    expect(tree.children.map(c => c.type)).toEqual(['heading', 'paragraph']);
    expect(md([p(tricky)])).not.toMatch(/<script>/);
  });
  test('en skillelinje lige efter et afsnit bliver en skillelinje, ikke en overskrift (fund fra fase 1)', () => {
    const tree = roundTrip([p('Varme: 35.000 kr.'), { type: 'separator' }, p('Rengøring')]);
    expect(tree.children.map(c => c.type)).toEqual(['paragraph', 'thematicBreak', 'paragraph']);
  });
  test('fed, kursiv og links; nabolister forbliver to lister', () => {
    const blocks: SerializableBlock[] = [
      { type: 'paragraph', content: [{ text: 'Se ' }, { text: 'vedtægterne', bold: true, href: 'https://example.test/a (b)' }, { text: ', fed', bold: true }, { text: 'midt' }, { text: 'ord', italic: true }] },
      { type: 'list', items: [[{ text: 'Et' }], [{ text: 'To\nmed linjeskift' }]] }, { type: 'list', items: [[{ text: 'Ny liste' }]] }];
    const tree = roundTrip(blocks);
    expect(tree.children.map(c => c.type)).toEqual(['paragraph', 'list', 'list']);
    expect(md(blocks)).toContain('[**vedtægterne**](https://example.test/a%20%28b%29)**, fed**midt*ord*');
  });
  test('emphasis, der ikke kan lukke i CommonMark, udelades i stedet for at blive til stjerner', () => {
    expect(md([{ type: 'paragraph', content: [{ text: '"kursiv"', italic: true }, { text: 'x' }] }])).toBe('"kursiv"x\n');
  });
  test('tabeller: én række pakkes ud; flere rækker bliver GFM med synlige afsnitsgrænser', () => {
    const cell = (...texts: string[]) => texts.map(t => p(t));
    const layout = roundTrip([{ type: 'table', rows: [[cell('Weekender og døgn', 'Private fester'), cell('ca. 840 timer')]] }]);
    expect(layout.children.map(c => c.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    const data: SerializableBlock[] = [{ type: 'table', rows: [[cell('A', 'A2 | pipe'), [{ type: 'list', items: [[{ text: 'punkt' }]] }]], [cell('B'), []]] }];
    expect(md(data)).toBe('| A · A2 \\| pipe | • punkt |\n| --- | --- |\n| B |  |\n');
    expect(roundTrip(data).children.map(c => c.type)).toEqual(['table']);
  });
  test('billeder får lokal sti og påkrævet alt-tekst', () => {
    expect(md([{ type: 'image', alt: 'Kort [nord]', name: 'abcdef0123456789.png' }])).toBe('![Kort \\[nord\\]](./doc1/abcdef0123456789.png)\n');
  });
  test('resumé er første afsnit, afkortet ved et ord', () => {
    expect(summaryOf([{ type: 'heading', level: 2, content: [{ text: 'Overskrift' }] }, p('  Første\nafsnit.  '), p('Andet')])).toBe('Første afsnit.');
    const long = summaryOf([p('ord '.repeat(200))]);
    expect(long.length).toBeLessThanOrEqual(300); expect(long.endsWith('ord…')).toBe(true);
    expect(summaryOf([{ type: 'table', rows: [[[p('Fra layouttabel')]]] }])).toBe('Fra layouttabel');
  });
  test('frontmatter er JSON-værdier og kan læses tilbage', () => {
    const meta = { id: 'abc', title: 'Titel med "citat" og: kolon', updatedAt: '2026-10-21T08:00:00.000Z', summary: 'Linje 1\nLinje 2' };
    const source = withFrontmatter(meta, 'Brødtekst\n');
    expect(splitFrontmatter(source)).toEqual({ meta, body: 'Brødtekst\n' });
    expect(() => splitFrontmatter('Ingen frontmatter')).toThrow('Frontmatter mangler');
  });
});

describe('Markdown-allowlist', () => {
  test.each([
    ['rå HTML', '<b>fed</b>\n'], ['HTML-blok', '<div>\nx\n</div>\n'], ['kodeblok', '```\nkode\n```\n'], ['inline kode', 'a `b` c\n'],
    ['citat', '> citat\n'], ['javascript-link', '[x](javascript:alert(1))\n'], ['relativt link', '[x](/intern/)\n'],
    ['billedreference', '![a][ref]\n\n[ref]: ./doc1/abcdef0123456789.png\n'], ['eksternt billede', '![a](https://evil.test/x.png)\n'],
    ['billede uden alt', '![](./doc1/abcdef0123456789.png)\n'], ['H1', '# Titel\n'], ['nummereret liste', '1. et\n'],
  ])('afviser %s', (_name, source) => expect(() => validateMarkdown(source, local)).toThrow('ikke-tilladte'));
  test('godkender den understøttede dialekt', () => {
    expect(() => validateMarkdown('## Titel\n\nTekst **fed** *kursiv* [link](https://example.test/)\\\nny linje\n\n- punkt\n\n---\n\n| a | b |\n| --- | --- |\n| c | d |\n\n![alt](./doc1/abcdef0123456789.png)\n', local)).not.toThrow();
  });
});
