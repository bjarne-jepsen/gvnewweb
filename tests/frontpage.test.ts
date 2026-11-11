import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { googleDocsBlocks } from '../lib/google/docs';
import { loadSite } from '../lib/site/load';
import { siteConfigSchema } from '../lib/sync/config';
import { docIdOf, parseFrontpage } from '../lib/sync/frontpage';
import { syncContent } from '../lib/sync/sync';
import { docJson, FakeDrive } from './helpers/fake-drive';

const link = (id: string) => `https://docs.google.com/document/d/${id}/edit?tab=t.0`;

test('docIdOf kender kun links til Google-dokumenter', () => {
  expect(docIdOf(link('1AbC_d-9'))).toBe('1AbC_d-9');
  expect(docIdOf('https://docs.google.com/document/u/1/d/abc')).toBe('abc');
  expect(docIdOf('https://docs.google.com/spreadsheets/d/abc/edit')).toBeUndefined();
  expect(docIdOf('https://example.test/document/d/abc')).toBeUndefined();
  expect(docIdOf(undefined)).toBeUndefined();
});

test('afsnit bliver intro, punkter med ét dokumentlink bliver genveje; resten rapporteres', () => {
  const { frontpage, problems } = parseFrontpage([
    { type: 'heading', level: 2, content: [{ text: 'Introtekst' }] },
    { type: 'paragraph', content: [{ text: 'Første  afsnit.' }] }, { type: 'paragraph', content: [{ text: 'Andet.' }] },
    { type: 'list', items: [
      [{ text: 'Kontakt', href: link('a') }],
      [{ text: 'Sælg ' }, { text: 'dit hus', href: link('b') }],
      [{ text: 'Ingen link' }],
      [{ text: 'Web', href: 'https://example.test/' }],
      [{ text: 'To', href: link('c') }, { text: ' links', href: link('d') }],
      [{ text: 'Igen', href: link('a') }],
    ] },
  ]);
  expect(frontpage).toEqual({ intro: 'Første afsnit.\n\nAndet.', shortcuts: [{ label: 'Kontakt', id: 'a' }, { label: 'Sælg dit hus', id: 'b' }] });
  expect(problems).toEqual(['"Ingen link" har intet link til et Google-dokument; punktet springes over', '"Web" har intet link til et Google-dokument; punktet springes over',
    '"To links" har links til flere dokumenter; punktet springes over', '"Igen" står der allerede; punktet springes over']);
});

test('et link-chip (@-link) bliver et almindeligt link med chippets titel', async () => {
  const doc = docJson('d', [{ text: 'x', bullet: true }]);
  (doc.tabs[0]!.documentTab.body.content[1] as any).paragraph.elements = [{ richLink: { richLinkId: 'r1', richLinkProperties: { title: 'Kontakt', uri: link('k'), mimeType: 'application/vnd.google-apps.document' } } }, { textRun: { content: '\n' } }];
  const { bodyBlocks } = await googleDocsBlocks(doc, 'd', async () => { throw new Error('nej'); });
  expect(bodyBlocks).toEqual([{ type: 'list', items: [[{ text: 'Kontakt', href: link('k') }, { text: '' }]] }]);
  expect(parseFrontpage(bodyBlocks).frontpage.shortcuts).toEqual([{ label: 'Kontakt', id: 'k' }]);
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function world() {
  const root = await mkdtemp(join(tmpdir(), 'gv-front-')); roots.push(root);
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify({ rootFolderId: 'root' }));
  const drive = new FakeDrive();
  drive.folder('f-foreningen', '10 Foreningen', 'root');
  drive.gdoc('doc-a', 'Kontakt', 'f-foreningen', docJson('doc-a', [{ text: 'Skriv til os.' }]));
  drive.gdoc('doc-b', 'Bestyrelsen', 'f-foreningen', docJson('doc-b', [{ text: 'Syv medlemmer.' }]));
  drive.folder('internt', 'Internt', 'elsewhere');
  drive.gdoc('secret', 'Hemmelig', 'internt', docJson('secret', [{ text: 'x' }]));
  const run = () => syncContent({ config: siteConfigSchema.parse({ rootFolderId: 'root' }), drive, contentDir: join(root, 'content') });
  const file = () => readFile(join(root, 'content/_forside.json'), 'utf8').then(JSON.parse, () => undefined);
  return { root, drive, run, file };
}
const forside = (paras: Parameters<typeof docJson>[1]) => docJson('forside', paras);

test('_forside i roden styrer intro og Det vigtigste; fejl bevarer sidste version; uden dokument bruges standarden', async () => {
  const w = await world();
  // Without _forside: the built-in intro and shortcuts (only those that exist).
  await w.run();
  let site = await loadSite(w.root);
  expect(site.frontpage.intro).toContain('389 fritliggende huse');
  expect(site.links.filter(l => l.group === 'shortcut').map(l => l.href)).toEqual(['/foreningen/kontakt/']);

  w.drive.gdoc('forside', '_forside', 'root', forside([{ text: 'Velkommen.' }, { text: 'Bestyrelsen', bullet: true, href: link('doc-b') },
    { text: 'Kontakt os', bullet: true, href: link('doc-a') }, { text: 'Intern', bullet: true, href: link('secret') }, { text: 'Uden link', bullet: true }]));
  let report = await w.run();
  expect(await w.file()).toEqual({ intro: 'Velkommen.', shortcuts: [{ label: 'Bestyrelsen', id: 'doc-b' }, { label: 'Kontakt os', id: 'doc-a' }, { label: 'Intern', id: 'secret' }] });
  expect(report.sections).toContainEqual({ section: '(forside)', title: '_forside', message: 'Forsidens intro eller Det vigtigste er ændret' });
  expect(report.warnings.map(w => w.message)).toEqual(expect.arrayContaining([
    '"Uden link" har intet link til et Google-dokument; punktet springes over',
    '"Intern" linker til et dokument, der ikke er en side på hjemmesiden; punktet vises ikke']));
  expect(report.warnings.map(w => w.message)).not.toContain('Fil direkte i roden; publiceres ikke');
  site = await loadSite(w.root);
  expect(site.frontpage.intro).toBe('Velkommen.');
  expect(site.links.filter(l => l.group === 'shortcut').map(l => [l.label, l.href])).toEqual([['Bestyrelsen', '/foreningen/bestyrelsen/'], ['Kontakt os', '/foreningen/kontakt/']]);
  expect(site.warnings).toContain('Forsiden: "Intern" springes over, fordi dokumentet ikke er en side på hjemmesiden');
  expect((await w.run()).sections).toEqual([]); // unchanged

  // An unreadable document keeps the last version.
  w.drive.failDownload.add('forside');
  report = await w.run();
  expect(report.errors.map(e => e.message)).toContain('Google: netværksfejl eller timeout; forsiden er uændret');
  expect((await w.file()).intro).toBe('Velkommen.');
  w.drive.failDownload.delete('forside');

  // Two _forside documents: an error, and the last version is kept.
  w.drive.gdoc('forside-2', '_forside', 'root', forside([{ text: 'Anden.' }]));
  report = await w.run();
  expect(report.errors.map(e => e.message)).toContain('Der må kun ligge ét _forside-dokument i roden; forsiden er uændret');
  expect((await w.file()).intro).toBe('Velkommen.');
  w.drive.files.delete('forside-2');

  // Removing it brings back the defaults.
  w.drive.files.delete('forside');
  report = await w.run();
  expect(await w.file()).toBeUndefined();
  expect(report.sections).toContainEqual({ section: '(forside)', title: '_forside', message: 'Forsiden bruger igen standardteksterne' });
  expect((await loadSite(w.root)).frontpage.intro).toContain('389 fritliggende huse');
});
