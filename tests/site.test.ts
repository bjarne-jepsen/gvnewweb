import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSite } from '../lib/site/load';
import { renderBody } from '../lib/site/render';
import { tableOfContents } from '../lib/site/toc';
import { siteConfigSchema } from '../lib/sync/config';
import { syncContent } from '../lib/sync/sync';
import { docJson, FakeDrive } from './helpers/fake-drive';

const local = (url: string) => url.startsWith('./d/');
test('renderer escaper tekst og attributter og kender kun dialekten', () => {
  const html = renderBody('## A \\&amp; \\<b\\>\n\n[l](https://example.test/?a=1&b="x") **f** *k*\\\nny\n\n- et\n- to\n\n---\n\n| h1 | h2 |\n| --- | --- |\n| c1 | c2 |\n\n![Alt "x"](./d/abcdef0123456789.png)\n', local, u => `/s/p/${u.slice(4)}`);
  expect(html).toContain('<h2 id="a-amp-b">A &amp;amp; &lt;b&gt;</h2>');
  expect(html).toContain('<a href="https://example.test/?a=1&amp;b=%22x%22" rel="noreferrer">l</a> <strong>f</strong> <em>k</em><br>');
  expect(html).toContain('<ul><li>et</li><li>to</li></ul>');
  expect(html).toContain('<thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>c1</td><td>c2</td></tr></tbody>');
  expect(html).toContain('<figure><img src="/s/p/abcdef0123456789.png" alt="Alt &quot;x&quot;"');
  expect(() => renderBody('<b>x</b>\n', local, u => u)).toThrow('ikke-tilladte');
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function site(folders: Record<string, string> = { foreningen: '40 Foreningen' }) {
  const root = await mkdtemp(join(tmpdir(), 'gv-site-')); roots.push(root);
  const config = { rootFolderId: 'root' };
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  const drive = new FakeDrive();
  for (const [key, name] of Object.entries(folders)) drive.folder(`f-${key}`, name, 'root');
  drive.gdoc('intro', '_intro', 'f-foreningen', docJson('intro', [{ text: 'Bestyrelse og regler.' }, { text: 'Kontakt os.' }]));
  drive.gdoc('doc-a', 'Om foreningen', 'f-foreningen', docJson('doc-a', [{ text: 'Tekst.' }]));
  drive.gdoc('doc-b', 'Bestyrelsen', 'f-foreningen', docJson('doc-b', [{ text: 'Mere.' }]));
  await syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
  return root;
}
test('loadSite giver sorterede sider, stier og interne ID\'er kun til kontrol', async () => {
  const s = await loadSite(await site());
  expect(s.items.map(i => [i.title, i.path])).toEqual([['Bestyrelsen', '/foreningen/bestyrelsen/'], ['Om foreningen', '/foreningen/om-foreningen/']]);
  expect(s.sections).toEqual([{ key: 'foreningen', order: 0, label: 'Foreningen', introHtml: '<p class="intro">Bestyrelse og regler.</p>\n<p class="intro">Kontakt os.</p>', path: '/foreningen/', news: false }]);
  expect(s.internalIds.sort()).toEqual(['doc-a', 'doc-b']);
});
test('introen kan linke til sider og sektioner via Google Docs- og mappelinks; ukendte links bliver tekst', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gv-site-')); roots.push(root);
  const config = { rootFolderId: 'root' };
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  const drive = new FakeDrive();
  drive.folder('f-om', '10 Om Grøndalsvænge', 'root'); drive.folder('f-bo', '20 Andelshaveren', 'root'); drive.folder('f-privat', 'Privat', 'root');
  drive.gdoc('doc-hus', 'Sådan får du et hus', 'f-om', docJson('doc-hus', [{ text: 'Tekst.' }]));
  drive.gdoc('doc-bo', 'Parkering', 'f-bo', docJson('doc-bo', [{ text: 'Tekst.' }]));
  drive.gdoc('intro', '_intro', 'f-om', docJson('intro', [
    { text: 'Læs om at få et hus', href: 'https://docs.google.com/document/d/doc-hus/edit' },
    { text: 'Andelshaveren', bold: true, href: 'https://drive.google.com/drive/u/0/folders/f-bo' },
    { text: 'Privat mappe', href: 'https://drive.google.com/drive/folders/f-privat' },
    { text: 'Ukendt dokument', href: 'https://docs.google.com/document/d/findes-ikke/edit' },
    { text: 'Rumly', href: 'https://rumly.dk/' },
  ]));
  await syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
  const s = await loadSite(root);
  expect(s.sections.find(x => x.key === 'om-groendalsvaenge')!.introHtml).toBe([
    '<p class="intro"><a href="/om-groendalsvaenge/saadan-faar-du-et-hus/">Læs om at få et hus</a></p>',
    '<p class="intro"><a href="/andelshaveren/"><strong>Andelshaveren</strong></a></p>',
    '<p class="intro">Privat mappe</p>',
    '<p class="intro">Ukendt dokument</p>',
    '<p class="intro"><a href="https://rumly.dk/" rel="noreferrer">Rumly</a></p>',
  ].join('\n'));
  expect(s.warnings.filter(w => w.startsWith('Om Grøndalsvænge (intro)'))).toEqual([
    'Om Grøndalsvænge (intro): et link til en mappe, der ikke er en sektion på hjemmesiden, vises som almindelig tekst',
    'Om Grøndalsvænge (intro): et link til et Google-dokument, der ikke er en side på hjemmesiden, vises som almindelig tekst',
  ]);
});
test('loadSite afviser manglende slug og redirect over en side', async () => {
  const root = await site();
  const slugsPath = join(root, 'content/_slugs.json'), slugs = JSON.parse(await readFile(slugsPath, 'utf8'));
  await writeFile(slugsPath, JSON.stringify({ ...slugs, 'doc-a': { ...slugs['doc-a'], previousPaths: ['/foreningen/bestyrelsen/'] } }));
  await rejects(loadSite(root), /rammer en eksisterende side/);
  const { ['doc-a']: _gone, ...rest } = slugs;
  await writeFile(slugsPath, JSON.stringify(rest));
  await rejects(loadSite(root), /doc-a mangler/);
});

test('nyheder filtreres ved build: fra datoen, til og med udløbsdagen i dansk tid, nyeste først', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gv-site-')); roots.push(root);
  const config = { rootFolderId: 'root' };
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  const drive = new FakeDrive();
  drive.folder('f-nyheder', '90 Nyheder', 'root');
  const news = (id: string, name: string, lines: string[]) => drive.gdoc(id, name, 'f-nyheder', docJson(id, [...lines.map(text => ({ text })), { text: 'Tekst' }]));
  news('nh-old', 'Gammel', ['Dato: 2026-09-01']); news('nh-exp', 'Udløber', ['Dato: 2026-10-01', 'Vises til: 2026-10-31']); news('nh-future', 'Fremtid', ['Dato: 2099-01-01']);
  await syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
  const visible = async (at: string) => (await loadSite(root, new Date(at))).items.map(i => i.title);
  expect(await visible('2026-10-31T22:30:00Z')).toEqual(['Udløber', 'Gammel']); // 23:30 the 31st in Copenhagen
  expect(await visible('2026-10-31T23:30:00Z')).toEqual(['Gammel']);           // 00:30 the 1st
  expect(await visible('2099-01-01T00:30:00+01:00')).toEqual(['Fremtid', 'Gammel']);
  const s = await loadSite(root, new Date('2026-10-21T12:00:00Z'));
  expect(s.internalIds.sort()).toEqual(['nh-exp', 'nh-future', 'nh-old']); expect(s.buildDay).toBe('2026-10-21');
  expect(s.items[0]).toMatchObject({ kind: 'notice', path: '/nyheder/2026-10-01-udloeber/', date: '2026-10-01', expires: '2026-10-31', html: '<p>Tekst</p>' });
  await rejects(loadSite(root, new Date('ugyldig')), /BUILD_AT/);
});

test('menuen følger tallene; en sektion uden sider vises ikke, en nyhedssektion altid', async () => {
  const root = await site({ foreningen: '40 Foreningen', bo: '20 Bo her', tom: '30 Tom', nyheder: '90 Nyheder', privat: 'Kladder' });
  // The section with the address /nyheder/ is the news section; it is shown also without news. "Tom" is not.
  expect((await loadSite(root)).sections.map(s => s.label)).toEqual(['Foreningen', 'Nyheder']);
  const drive = new FakeDrive();
  for (const [id, name] of [['f-foreningen', '40 Foreningen'], ['f-bo', '20 Bo her'], ['f-tom', '30 Tom'], ['f-nyheder', '90 Nyheder']]) drive.folder(id!, name!, 'root');
  drive.gdoc('doc-a', 'Om foreningen', 'f-foreningen', docJson('doc-a', [{ text: 'Tekst.' }]));
  drive.gdoc('doc-b', 'Bestyrelsen', 'f-foreningen', docJson('doc-b', [{ text: 'Mere.' }]));
  drive.gdoc('doc-c', 'Affald', 'f-bo', docJson('doc-c', [{ text: 'Tirsdag.' }]));
  await syncContent({ config: siteConfigSchema.parse({ rootFolderId: 'root' }), drive, contentDir: join(root, 'content') });
  expect((await loadSite(root)).sections.map(s => [s.order, s.label, s.path, s.news])).toEqual([
    [0, 'Bo her', '/bo-her/', false], [1, 'Foreningen', '/foreningen/', false], [2, 'Nyheder', '/nyheder/', true]]);
});

test('genveje og sidefod peger kun på sider, der findes; ProBo kun med https', async () => {
  const root = await site();
  const config = JSON.parse(await readFile(join(root, 'config/site.json'), 'utf8'));
  await writeFile(join(root, 'config/site.json'), JSON.stringify({ ...config, links: { probo: 'https://probo.example.test/' } }));
  const s = await loadSite(root);
  expect(s.links).toEqual([{ id: 'footer-probo', group: 'footer', order: 2, label: 'Dokumenter i ProBo', href: 'https://probo.example.test/', external: true }]);
  expect(s.warnings).toContain('Forsiden: "Kontakt" → /foreningen/kontakt/ springes over, fordi siden ikke findes');
  expect(s.warnings).toContain('Sidefoden: "Regler og dokumenter" → /foreningen/regler-og-dokumenter/ springes over, fordi siden ikke findes');
  expect(() => siteConfigSchema.parse({ ...config, links: { probo: 'http://probo.example.test/' } })).toThrow('https');
  expect(() => siteConfigSchema.parse({ ...config, links: { andet: 'https://x.test/' } })).toThrow();
});

test('links til andre Google-dokumenter peger på deres sider, og intet Drive-ID når siden', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gv-site-')); roots.push(root);
  const config = { rootFolderId: 'root' };
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  const drive = new FakeDrive();
  drive.folder('f-foreningen', '40 Foreningen', 'root');
  drive.gdoc('doc-kontakt', 'Kontakt', 'f-foreningen', docJson('doc-kontakt', [{ text: 'Skriv til os.' }]));
  drive.gdoc('doc-b', 'Bestyrelsen', 'f-foreningen', docJson('doc-b', [
    { text: 'Kontakt', href: 'https://docs.google.com/document/u/1/d/doc-kontakt/edit' },
    { text: 'Kladde', href: 'https://docs.google.com/document/d/doc-privat/edit?tab=t.0' },
    { text: 'Andelsbo', href: 'https://andelsbo.dk/' },
  ]));
  await syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
  const s = await loadSite(root);
  const { html } = s.items.find(i => i.id === 'doc-b')!;
  expect(html).toContain('<a href="/foreningen/kontakt/">Kontakt</a>');
  expect(html).toContain('<p>Kladde</p>');
  expect(html).toContain('<a href="https://andelsbo.dk/" rel="noreferrer">Andelsbo</a>');
  expect(html).not.toContain('doc-');
  expect(s.warnings.filter(w => w.startsWith('Bestyrelsen'))).toEqual(['Bestyrelsen: et link til et Google-dokument, der ikke er en side på hjemmesiden, vises som almindelig tekst']);
});

test('H2 får et unikt id fra teksten, og layoutets egne id\'er er reserveret', () => {
  const html = renderBody('## Fester og **traditioner**\n\n## Fester og traditioner\n\n## Indhold\n\n## !!!\n\n### Ingen id\n', local, u => u);
  expect(html).toContain('<h2 id="fester-og-traditioner">Fester og <strong>traditioner</strong></h2>');
  expect(html).toContain('<h2 id="fester-og-traditioner-2">');
  expect(html).toContain('<h2 id="indhold-2">');
  expect(html).toContain('<h2 id="afsnit">');
  expect(html).toContain('<h3>Ingen id</h3>');
});

test('"På denne side": kun ved mindst tre H2, med ingressen skilt fra', () => {
  const body = renderBody('Ingres.\n\n## Én\n\nTekst.\n\n## To **fed**\n\n## Tre\n', local, u => u);
  const toc = tableOfContents(body);
  expect(toc.headings).toEqual([{ id: 'en', label: 'Én' }, { id: 'to-fed', label: 'To fed' }, { id: 'tre', label: 'Tre' }]);
  expect(toc.lead).toBe('<p>Ingres.</p>');
  expect(toc.lead + toc.rest).toBe(body);
  expect(tableOfContents(renderBody('## Én\n\n## To\n', local, u => u)).headings).toEqual([]);
  expect(tableOfContents(renderBody('## Én\n\n## To\n\n## Tre\n', local, u => u)).lead).toBe('');
});
