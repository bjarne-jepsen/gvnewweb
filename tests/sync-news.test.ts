import { afterEach, describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { sheetRows } from '../lib/google/sheets';
import { digest } from '../lib/sync/content';
import { siteConfigSchema } from '../lib/sync/config';
import { GDOC } from '../lib/sync/drive';
import { paragraphsOf, parseDate, parseNews } from '../lib/sync/news';
import { hasChanges } from '../lib/sync/report';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { FakeDrive, sheetJson } from './helpers/fake-drive';

const serial = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
const header = ['ID', 'Dato', 'Titel', 'Tekst', 'Udløber', 'Status'];
type Row = Parameters<typeof sheetJson>[0][number];
const generalforsamling: Row = ['n-aaa111', serial('2026-10-21'), 'Generalforsamling',
  { text: 'Indkaldelse og dagsorden.\nSe bilag.\n\nLæs mere på https://groendalsvaenge.dk/gf. Tak!', links: [{ start: 12, end: 24, uri: 'https://example.test/dagsorden' }] }, '', 'offentlig'];
const baseRows: Row[] = [
  generalforsamling,
  ['n-bbb222', '2026-10-01', 'DRAFT_CANARY', 'Tekst', '', 'kladde'],
  ['n-ccc333', '2026-10-01', 'EMPTY_CANARY', 'Tekst', '', ''],
  ['n-ddd444', '2026-10-01', 'UNKNOWN_CANARY', 'Tekst', '', 'måske'],
  ['', '2026-10-02', 'Uden ID', 'Tekst', '', 'offentlig'],
  ['n-eee555', '21.10.2026', 'Vandet lukkes', 'Mandag kl. 9-12.', '31-10-2026', 'Offentlig'],
];

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function world(rows: Row[] = baseRows) {
  const dir = await mkdtemp(join(tmpdir(), 'gv-news-')); roots.push(dir);
  const drive = new FakeDrive();
  drive.folder('f-nyheder', 'nyheder', 'root');
  drive.sheet('sheet', 'Nyheder', 'f-nyheder', sheetJson([header, ...rows]));
  const config = siteConfigSchema.parse({ rootFolderId: 'root', sections: { nyheder: { type: 'notice', source: 'sheet' } } });
  const contentDir = join(dir, 'content');
  const run = (allowMassRemoval = false) => syncContent({ config, drive, contentDir, allowMassRemoval, now: new Date('2026-10-21T20:00:00Z') });
  const tree = async () => Object.fromEntries(await Promise.all((await walk(contentDir).catch(() => [])).sort().map(async p => [relative(contentDir, p), digest(await readFile(p))])));
  const news = async (id: string) => JSON.parse(await readFile(join(contentDir, `nyheder/${id}.json`), 'utf8'));
  const setRows = (next: Row[]) => drive.update('sheet', { sheet: sheetJson([header, ...next]) });
  return { drive, contentDir, run, tree, news, setRows };
}

test('kun "offentlig" publiceres; kladde, tom og ukendt status når ikke content/', async () => {
  const w = await world();
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'nyheder/n-aaa111.json', 'nyheder/n-eee555.json']);
  for (const path of await walk(w.contentDir)) expect(await readFile(path, 'utf8')).not.toMatch(/CANARY/);
  expect(report.warnings).toEqual([{ section: 'nyheder', title: 'UNKNOWN_CANARY', message: 'Ukendt status "måske"; publiceres ikke' }]);
  expect(report.errors).toEqual([{ section: 'nyheder', title: 'Uden ID', message: 'Mangler ID; publiceres ikke' }]);
  expect(await w.news('n-aaa111')).toEqual({
    id: 'n-aaa111', title: 'Generalforsamling', date: '2026-10-21', summary: 'Indkaldelse og dagsorden. Se bilag.',
    body: 'Indkaldelse [og dagsorden](https://example.test/dagsorden).\\\nSe bilag.\n\nLæs mere på [https://groendalsvaenge.dk/gf](https://groendalsvaenge.dk/gf). Tak!\n',
    updatedAt: '2026-10-21T08:00:00.000Z' });
  expect((await w.news('n-eee555'))).toMatchObject({ date: '2026-10-21', expires: '2026-10-31' });
  expect(JSON.parse(await readFile(join(w.contentDir, '_slugs.json'), 'utf8'))['n-aaa111'].slug).toBe('2026-10-21-generalforsamling');
});

test('rækkefølgen af rækker påvirker hverken ID\'er eller output', async () => {
  const w = await world();
  await w.run();
  const before = await w.tree();
  w.setRows([...baseRows].reverse());
  expect(hasChanges(await w.run())).toBe(false);
  expect(await w.tree()).toEqual(before);
});

test('rækkefejl beholder sidste version; resten synkroniseres', async () => {
  const w = await world();
  await w.run();
  const before = await w.tree();
  w.setRows([
    ['n-aaa111', 'i morgen', 'Generalforsamling', 'Ny tekst', '', 'offentlig'],
    ['n-eee555', '2026-10-21', 'Vandet lukkes', 'Ny tekst', '2026-10-01', 'offentlig'],
    ['n-fff666', '2026-10-22', 'Ny A', 'Tekst', '', 'offentlig'], ['n-fff666', '2026-10-22', 'Ny B', 'Tekst', '', 'offentlig'],
    ['n-ggg777', '2026-10-22', 'Ny C', 'Tekst', '', 'offentlig'],
  ]);
  const report = await w.run();
  expect(report.errors.map(e => [e.id, e.message])).toEqual([
    ['n-aaa111', 'Ugyldig eller manglende dato'], ['n-eee555', 'Udløbsdatoen ligger før datoen'],
    ['n-fff666', 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID'], ['n-fff666', 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID']]);
  expect(report.added.map(a => a.id)).toEqual(['n-ggg777']);
  const after = await w.tree();
  expect(after['nyheder/n-aaa111.json']).toBe(before['nyheder/n-aaa111.json']);
  expect(after['nyheder/n-eee555.json']).toBe(before['nyheder/n-eee555.json']);
});

test('manglende kolonne, ulæseligt ark og to ark beholder alle nyheder', async () => {
  const w = await world();
  await w.run();
  const before = await w.tree();
  w.drive.update('sheet', { sheet: sheetJson([['ID', 'Dato', 'Titel', 'Tekst'], ['n-aaa111', '2026-10-21', 'X', 'Y']]) });
  expect((await w.run()).errors).toEqual([{ section: 'nyheder', title: 'Nyheder', message: 'Nyhedsarket mangler kolonnen "status" i første række; nyhederne er uændrede' }]);
  w.setRows(baseRows); w.drive.denied.add('sheet');
  expect((await w.run()).errors[0]!.message).toBe('Synkroniseringskontoen kan ikke læse arket; nyhederne er uændrede');
  w.drive.denied.clear(); w.drive.sheet('sheet-2', 'Nyheder kopi', 'f-nyheder', sheetJson([header]));
  expect((await w.run()).errors[0]!.message).toBe('Der må kun ligge ét nyhedsark i mappen; nyhederne er uændrede');
  expect(await w.tree()).toEqual(before);
});

test('offentlig → kladde fjerner nyheden; andre filer i nyheder/ giver advarsler', async () => {
  const w = await world();
  w.drive.file('doc', 'nyhed 1', 'f-nyheder', GDOC);
  const first = await w.run();
  expect(first.warnings.map(x => x.message)).toContain(`Filtypen ${GDOC} accepteres ikke i nyheder`);
  w.setRows(baseRows.map(r => r[0] === 'n-eee555' ? [...r.slice(0, 5), 'kladde'] : r));
  expect((await w.run()).removed.map(r => r.id)).toEqual(['n-eee555']);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'nyheder/n-aaa111.json']);
});

test('et tømt ark kræver tilladelse til masseudtagning', async () => {
  const w = await world();
  await w.run();
  w.setRows([]);
  await rejects(w.run(), /2 af 2 filer/);
  expect((await w.run(true)).removed).toHaveLength(2);
});

describe('nyhedsparser', () => {
  test('datoer: serienummer, ISO og danske skrivemåder; ugyldige afvises', () => {
    const cell = (text: string, number?: number) => ({ text, runs: [], ...(number !== undefined ? { number } : {}) });
    expect([parseDate(cell('21.10.2026', serial('2026-10-21'))), parseDate(cell('2026-10-21')), parseDate(cell('21-10-2026')), parseDate(cell('1.2.2027')), parseDate(cell('21/10/2026'))])
      .toEqual(['2026-10-21', '2026-10-21', '2026-10-21', '2027-02-01', '2026-10-21']);
    for (const bad of ['30.02.2026', '2026-13-01', 'i morgen', '21.10.26', '']) expect(parseDate(cell(bad))).toBeUndefined();
    expect(parseDate(cell('5', 5))).toBeUndefined(); // a plain number is not a date
  });
  test('afsnit, linjeskift og links; kun http(s) bliver links', () => {
    expect(paragraphsOf([{ text: 'Et\nTo\n\n  \nTre (se https://example.test/a.) og javascript:alert(1)' }])).toEqual([
      [{ text: 'Et\nTo' }], [{ text: 'Tre (se ' }, { text: 'https://example.test/a', href: 'https://example.test/a' }, { text: '.) og javascript:alert(1)' }]]);
    const rows = sheetRows(sheetJson([[{ text: 'Klik her', hyperlink: 'javascript:alert(1)' }, { text: 'Klik her', hyperlink: 'https://example.test/' }]]));
    expect(rows[0]!.map(c => c.runs)).toEqual([[{ text: 'Klik her' }], [{ text: 'Klik her', href: 'https://example.test/' }]]);
  });
  test('kolonner findes efter navn uanset rækkefølge og store bogstaver; dubletter afvises', () => {
    const parsed = parseNews(sheetRows(sheetJson([['status', 'TITEL', 'tekst', 'dato', 'id'], ['offentlig', 'A', 'B', '2026-10-21', 'n-xyz']])));
    expect(parsed.rows).toEqual([{ id: 'n-xyz', title: 'A', date: '2026-10-21', paragraphs: [[{ text: 'B' }]] }]);
    expect(() => parseNews(sheetRows(sheetJson([['ID', 'ID', 'Dato', 'Titel', 'Tekst', 'Status']])))).toThrow('flere gange');
    expect(() => parseNews([])).toThrow('mangler kolonnen');
  });
});
