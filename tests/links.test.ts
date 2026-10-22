import { expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inlineSchema, safeHref } from '../lib/contracts/blocks';
import { googleDocsBlocks } from '../lib/google/docs';
import { sheetRows } from '../lib/google/sheets';
import { renderBody } from '../lib/site/render';
import { assertRoundTrip, blocksToMarkdown, validateMarkdown, type SerializableBlock } from '../lib/sync/markdown';
import { sheetJson } from './helpers/fake-drive';

// Phase 5e: e-mail links. One rule (safeHref) for parser, Markdown validation, rendering and news.
test('linkreglen: http(s) og mailto til én adresse uden parametre', () => {
  expect(safeHref('https://example.test')).toBe('https://example.test/');
  expect(safeHref('http://example.test/a?b=1')).toBe('http://example.test/a?b=1');
  expect(safeHref('mailto:fu@groendalsvaenge.dk')).toBe('mailto:fu@groendalsvaenge.dk');
  expect(safeHref('MAILTO:Fu.Udvalg+gv@Groendalsvaenge.dk')).toBe('mailto:Fu.Udvalg+gv@Groendalsvaenge.dk');
  for (const bad of ['mailto:fu@groendalsvaenge.dk?subject=Hej', 'mailto:a@b.dk?bcc=c@d.dk', 'mailto:a@b.dk?body=x', 'mailto:a@b.dk,c@d.dk', 'mailto:a@b.dk;c@d.dk',
    'mailto:', 'mailto:ikke-en-adresse', 'mailto:a@b', 'mailto:a@b.dk.', 'mailto:%61@b.dk', 'mailto:a b@c.dk', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.test/', '/intern/', '', undefined, 42]) {
    expect([bad, safeHref(bad)]).toEqual([bad, undefined]);
  }
  expect(inlineSchema.safeParse({ text: 'x', href: 'mailto:fu@groendalsvaenge.dk' }).success).toBe(true);
  expect(inlineSchema.safeParse({ text: 'x', href: 'mailto:a@b.dk?bcc=c@d.dk' }).success).toBe(false);
});

const raw = JSON.parse(await readFile('tests/fixtures/google-document.json', 'utf8'));
const withLink = (url: string) => { const doc = structuredClone(raw); doc.tabs[0].documentTab.body.content[5].paragraph.elements[0].textRun.textStyle.link.url = url; return doc; };
test('parseren tager mailto med og afviser mailto med parametre', async () => {
  const { bodyBlocks } = await googleDocsBlocks(withLink('mailto:kom@groendalsvaenge.dk'), 'test-doc-id', async () => { throw new Error(); });
  expect(JSON.stringify(bodyBlocks)).toContain('"href":"mailto:kom@groendalsvaenge.dk"');
  await rejects(googleDocsBlocks(withLink('mailto:kom@groendalsvaenge.dk?bcc=x@y.dk'), 'test-doc-id', async () => { throw new Error(); }), /e-mail til én adresse/);
});

test('mailto overlever rundturen gennem Markdown og renderes som link', () => {
  const blocks: SerializableBlock[] = [{ type: 'paragraph', content: [{ text: 'Skriv til ' }, { text: 'Kommunikationsudvalget', href: 'mailto:kom@groendalsvaenge.dk', bold: true }, { text: '.' }] }];
  const md = blocksToMarkdown(blocks, () => '');
  expect(md).toBe('Skriv til [**Kommunikationsudvalget**](mailto:kom@groendalsvaenge.dk).\n');
  assertRoundTrip(blocks, validateMarkdown(md, () => false));
  expect(renderBody(md, () => false, u => u)).toBe('<p>Skriv til <a href="mailto:kom@groendalsvaenge.dk" rel="noreferrer"><strong>Kommunikationsudvalget</strong></a>.</p>');
  for (const bad of ['[x](mailto:a@b.dk?bcc=c@d.dk)\n', '[x](mailto:a@b.dk,c@d.dk)\n', '[x](javascript:alert(1))\n']) expect(() => validateMarkdown(bad, () => false)).toThrow('ikke-tilladte');
});

test('et mailto-link i en celle i nyhedsarket bliver et link; andet bliver tekst', () => {
  const rows = sheetRows(sheetJson([[{ text: 'Skriv til os', hyperlink: 'mailto:kom@groendalsvaenge.dk' }, { text: 'Skjult', hyperlink: 'mailto:a@b.dk?bcc=c@d.dk' }]]));
  expect(rows[0]!.map(c => c.runs)).toEqual([[{ text: 'Skriv til os', href: 'mailto:kom@groendalsvaenge.dk' }], [{ text: 'Skjult' }]]);
});
