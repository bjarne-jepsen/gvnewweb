import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { siteConfigSchema } from '../lib/sync/config';
import { digest } from '../lib/sync/content';
import { GDOC } from '../lib/sync/drive';
import { splitFrontmatter } from '../lib/sync/markdown';
import { hasChanges, renderReport } from '../lib/sync/report';
import { setSlug, slugify, slugsSchema } from '../lib/sync/slugs';
import { readContent, syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive } from './helpers/fake-drive';

// The folder-model rules from phase 2a, exercised with Google Docs (PDF support was removed in 5a).
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const config = (extra: Record<string, unknown> = {}) => siteConfigSchema.parse({
  rootFolderId: 'root',
  sections: { foreningen: { type: 'guide', accepts: ['gdoc'] }, nyheder: { type: 'notice', source: 'sheet' }, ...extra },
  ignoredFolders: ['kalender', 'redaktion'],
});
const doc = (id: string, text = `Tekst i ${id}.`) => docJson(id, [{ text }]);
async function world(extra: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'gv-sync-')); roots.push(dir);
  const drive = new FakeDrive();
  for (const name of ['foreningen', 'nyheder', 'kalender', 'redaktion', ...Object.keys(extra)]) drive.folder(`f-${name}`, name, 'root');
  drive.folder('internt', 'Bestyrelsen internt', 'elsewhere');
  const contentDir = join(dir, 'content'), cfg = config(extra);
  const run = (allowMassRemoval = false, c = cfg) => syncContent({ config: c, drive, contentDir, allowMassRemoval, now: new Date('2026-10-21T20:00:00Z') });
  const tree = async () => Object.fromEntries(await Promise.all((await walk(contentDir).catch(() => [])).sort().map(async p => [relative(contentDir, p), digest(await readFile(p))])));
  const json = async (path: string) => JSON.parse(await readFile(join(contentDir, path), 'utf8'));
  const page = async (path: string) => splitFrontmatter(await readFile(join(contentDir, path), 'utf8'));
  return { drive, contentDir, run, tree, json, page };
}

test('kun filer direkte i en sektionsmappe publiceres; resten rapporteres eller ignoreres', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'Vedtægter', 'f-foreningen', doc('doc-a'));
  w.drive.gdoc('root-doc', 'ROOT_CANARY', 'root', doc('root-doc', 'ROOT_CANARY'));
  w.drive.gdoc('red-doc', 'REDAKTION_CANARY', 'f-redaktion', doc('red-doc', 'REDAKTION_CANARY'));
  w.drive.folder('sub', 'Arkiv', 'f-foreningen');
  w.drive.gdoc('sub-doc', 'SUB_CANARY', 'sub', doc('sub-doc', 'SUB_CANARY'));
  w.drive.gdoc('private', 'PRIVATE_CANARY', 'internt', doc('private', 'PRIVATE_CANARY'));
  w.drive.file('a-pdf', 'Vedtægter.pdf', 'f-foreningen', 'application/pdf');
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'foreningen/doc-a.md']);
  expect(await w.json('_slugs.json')).toEqual({ 'doc-a': { section: 'foreningen', slug: 'vedtaegter', previousPaths: [] } });
  expect((await w.page('foreningen/doc-a.md')).meta.title).toBe('Vedtægter');
  for (const path of await walk(w.contentDir)) expect((await readFile(path)).toString()).not.toMatch(/CANARY/);
  // Documents belong in ProBo: a PDF in a section folder is reported and never published.
  expect(report.warnings.map(x => x.message)).toEqual(expect.arrayContaining([
    'Fil direkte i roden; publiceres ikke', 'Undermappe; indholdet publiceres ikke', 'Filtypen application/pdf accepteres ikke i foreningen']));
  expect(JSON.stringify(report)).not.toMatch(/REDAKTION_CANARY|SUB_CANARY|PRIVATE_CANARY/);
  expect(report.added).toHaveLength(1);
  expect(report.warnings).toContainEqual({ section: 'nyheder', title: '(nyhedsark)', message: 'Der ligger intet nyhedsark i mappen' });
  expect(renderReport(report)).toContain('1 nye, 0 ændrede, 0 fjernede');
});

test('konfigurationen kender kun sider og nyheder', () => {
  expect(() => siteConfigSchema.parse({ rootFolderId: 'root', sections: { dokumenter: { type: 'document', accepts: ['pdf'] } } })).toThrow();
  expect(() => siteConfigSchema.parse({ rootFolderId: 'root', sections: { foreningen: { type: 'guide', category: 'x', accepts: ['gdoc'] } } })).toThrow();
});

test('genvej publicerer målets indhold med målets ID og genvejens navn', async () => {
  const w = await world();
  w.drive.gdoc('target-1', 'Vedtaegter_endelig_v3', 'internt', doc('target-1', 'Indhold fra den interne fil.'));
  w.drive.shortcut('shortcut-1', 'Vedtægter', 'f-foreningen', 'target-1', GDOC);
  await w.run();
  const { meta, body } = await w.page('foreningen/target-1.md');
  expect(meta).toMatchObject({ id: 'target-1', title: 'Vedtægter' }); expect(body).toBe('Indhold fra den interne fil.\n');
  expect(Object.keys(await w.tree())).not.toContain('foreningen/shortcut-1.md');
  // Renaming the internal target does not change the published title or URL.
  w.drive.update('target-1', { name: 'Vedtaegter_endelig_v4' });
  expect(hasChanges(await w.run())).toBe(false);
});

test('fjernet genvej fjerner siden, men bevarer slug til en senere genkomst', async () => {
  const w = await world();
  w.drive.gdoc('target-1', 'intern', 'internt', doc('target-1'));
  w.drive.shortcut('shortcut-1', 'Husorden', 'f-foreningen', 'target-1', GDOC);
  await w.run();
  w.drive.files.delete('shortcut-1');
  const report = await w.run();
  expect(report.removed).toEqual([{ section: 'foreningen', id: 'target-1', title: 'Husorden' }]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json']);
  expect((await w.json('_slugs.json'))['target-1'].slug).toBe('husorden');
});

test('omdøbning bevarer URL; flytning mellem sektioner giver en tidligere sti', async () => {
  const w = await world({ arkiv: { type: 'guide', accepts: ['gdoc'] } });
  w.drive.gdoc('doc-a', 'Referat marts', 'f-foreningen', doc('doc-a'));
  await w.run();
  w.drive.update('doc-a', { name: 'Referat fra marts 2026' });
  expect((await w.run()).changed).toHaveLength(1);
  expect((await w.json('_slugs.json'))['doc-a']).toEqual({ section: 'foreningen', slug: 'referat-marts', previousPaths: [] });
  w.drive.update('doc-a', { parent: 'f-arkiv' });
  await w.run();
  expect((await w.json('_slugs.json'))['doc-a']).toEqual({ section: 'arkiv', slug: 'referat-marts', previousPaths: ['/foreningen/referat-marts/'] });
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'arkiv/doc-a.md']);
});

test('manuelt ændret slug flytter den gamle sti til previousPaths og afviser kollisioner', () => {
  const slugs = slugsSchema.parse({ a: { section: 'foreningen', slug: 'vedtaegter', previousPaths: [] }, b: { section: 'foreningen', slug: 'husorden', previousPaths: ['/foreningen/gammel/'] } });
  expect(setSlug(slugs, 'a', 'vedtaegter-2026').a).toEqual({ section: 'foreningen', slug: 'vedtaegter-2026', previousPaths: ['/foreningen/vedtaegter/'] });
  expect(() => setSlug(slugs, 'a', 'husorden')).toThrow('bruges allerede');
  expect(() => setSlug(slugs, 'a', 'gammel')).toThrow('bruges allerede');
  expect(() => setSlug(slugs, 'a', '../x')).toThrow();
  expect(slugify('Ærø, Øster & Åbo — 2026!', 'X')).toBe('aeroe-oester-aabo-2026');
  expect(slugify('???', 'Ab_Cd-1234567')).toBe('side-abcd1234');
});

test('slug-kollision publicerer kun den første; den anden rapporteres', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'Referat', 'f-foreningen', doc('doc-a'));
  w.drive.gdoc('doc-b', 'referat', 'f-foreningen', doc('doc-b'));
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'foreningen/doc-a.md']);
  expect(report.errors).toEqual([{ section: 'foreningen', id: 'doc-b', title: 'referat', message: 'Adressen /foreningen/referat/ bruges allerede; publiceres ikke' }]);
  expect(Object.keys(await w.json('_slugs.json'))).toEqual(['doc-a']);
});

test('et dokument, der vender tilbage til en overtaget adresse, publiceres ikke; resten fortsætter', async () => {
  const w = await world();
  w.drive.gdoc('doc-old', 'Husorden', 'f-foreningen', doc('doc-old'));
  await w.run();
  w.drive.files.delete('doc-old');
  w.drive.gdoc('doc-new', 'Husorden', 'f-foreningen', doc('doc-new'));
  await w.run();
  w.drive.gdoc('doc-old', 'Husorden', 'f-foreningen', doc('doc-old'));
  const report = await w.run();
  expect(report.errors).toEqual([{ section: 'foreningen', id: 'doc-old', title: 'Husorden', message: 'Adressen /foreningen/husorden/ bruges allerede; publiceres ikke' }]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'foreningen/doc-new.md']);
});

test('genvej til mappe, genvej uden adgang og dobbelt mål publiceres ikke', async () => {
  const w = await world();
  w.drive.shortcut('sc-folder', 'Hele arkivet', 'f-foreningen', 'internt', 'application/vnd.google-apps.folder');
  w.drive.gdoc('secret', 'secret', 'internt', doc('secret')); w.drive.denied.add('secret');
  w.drive.shortcut('sc-denied', 'Hemmelig', 'f-foreningen', 'secret', GDOC);
  w.drive.gdoc('twice', 'twice', 'internt', doc('twice'));
  w.drive.shortcut('sc-1', 'Kopi 1', 'f-foreningen', 'twice', GDOC); w.drive.shortcut('sc-2', 'Kopi 2', 'f-foreningen', 'twice', GDOC);
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json']);
  expect(report.warnings.map(x => x.message)).toContain('Genvej til en mappe; publiceres ikke');
  expect(report.errors.map(x => x.message)).toEqual(['Synkroniseringskontoen kan ikke læse målfilen',
    'Samme fil optræder flere gange, eller ID kolliderer med et andet ID', 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID']);
});

test('fejl i listning eller manglende sektionsmappe ændrer intet', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', doc('doc-a')); w.drive.gdoc('doc-b', 'B', 'f-foreningen', doc('doc-b'));
  await w.run();
  const before = await w.tree();
  w.drive.failList.add('f-foreningen');
  await rejects(w.run(), /HTTP 500/);
  w.drive.failList.clear(); w.drive.failList.add('root');
  await rejects(w.run(), /HTTP 500/);
  w.drive.failList.clear(); w.drive.files.delete('f-nyheder');
  await rejects(w.run(), /"nyheder" mangler/);
  expect(await w.tree()).toEqual(before);
  expect(await Bun.file(join(w.contentDir, '../.sync/lock')).exists()).toBe(false);
});

test('en efterladt .sync/lock fra en afsluttet proces fjernes og nævnes i rapporten', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', doc('doc-a'));
  const gone = Bun.spawn(['true']); await gone.exited;
  await mkdir(join(w.contentDir, '../.sync'), { recursive: true });
  await writeFile(join(w.contentDir, '../.sync/lock'), JSON.stringify({ pid: gone.pid, startedAt: '2026-10-22T16:39:00.000Z' }));
  const report = await w.run();
  expect(report.added.map(e => e.title)).toEqual(['A']);
  expect(report.warnings.filter(e => e.section === '.sync')).toEqual([{ section: '.sync', title: 'lock', message: `Efterladt lås fra proces ${gone.pid} (startet 2026-10-22T16:39:00.000Z) er fjernet; processen kører ikke længere` }]);
  expect(await Bun.file(join(w.contentDir, '../.sync/lock')).exists()).toBe(false);
});

test('ulæseligt mål, fejlet hentning og ugyldigt dokument beholder sidste gyldige version', async () => {
  const w = await world();
  w.drive.gdoc('target', 'intern', 'internt', doc('target')); w.drive.shortcut('sc', 'Vedtægter', 'f-foreningen', 'target', GDOC);
  w.drive.gdoc('doc-b', 'Husorden', 'f-foreningen', doc('doc-b')); w.drive.gdoc('doc-c', 'Budget', 'f-foreningen', doc('doc-c'));
  await w.run();
  const before = await w.tree();
  w.drive.update('target', { doc: doc('target', 'Ny version') }); w.drive.denied.add('target');
  w.drive.update('doc-b', { doc: doc('doc-b', 'Ny husorden') }); w.drive.failDownload.add('doc-b');
  const twoTabs = doc('doc-c', 'Ny tekst'); twoTabs.tabs.push(structuredClone(twoTabs.tabs[0]!));
  w.drive.update('doc-c', { doc: twoTabs });
  w.drive.gdoc('doc-d', 'Nyt dokument', 'f-foreningen', doc('doc-d'));
  const report = await w.run();
  expect(report.errors.map(e => e.id)).toEqual(['target', 'doc-b', 'doc-c']);
  expect(report.removed).toEqual([]); expect(report.added.map(a => a.id)).toEqual(['doc-d']);
  const after = await w.tree();
  for (const [path, hash] of Object.entries(before)) if (path !== '_slugs.json') expect(after[path]).toBe(hash);
});

test('mål i papirkurven fjernes med en advarsel', async () => {
  const w = await world();
  w.drive.gdoc('target', 'intern', 'internt', doc('target')); w.drive.shortcut('sc', 'Vedtægter', 'f-foreningen', 'target', GDOC);
  await w.run();
  w.drive.update('target', { trashed: true });
  const report = await w.run();
  expect(report.removed.map(r => r.id)).toEqual(['target']);
  expect(report.warnings.map(x => x.message)).toContain('Målfilen ligger i papirkurven; siden fjernes');
});

test('masseudtagning kræver eksplicit tilladelse', async () => {
  const w = await world();
  for (const id of ['a1', 'a2', 'a3']) w.drive.gdoc(id, id, 'f-foreningen', doc(id));
  await w.run();
  const before = await w.tree();
  w.drive.files.delete('a1'); w.drive.files.delete('a2');
  await rejects(w.run(), /2 af 3 filer/);
  expect(await w.tree()).toEqual(before);
  expect((await w.run(true)).removed).toHaveLength(2);
  w.drive.files.delete('a3');
  expect((await w.run()).removed).toHaveLength(1); // a single removal never needs confirmation
});

test('updatedAt følger indholdet, ikke modifiedTime; uændret kørsel er byte-identisk', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', doc('doc-a', 'v1'));
  w.drive.update('doc-a', { modifiedTime: '2026-10-01T08:00:00Z' });
  await w.run();
  const before = await w.tree();
  w.drive.update('doc-a', { modifiedTime: '2026-10-21T09:00:00Z' });
  const quiet = await w.run();
  expect(hasChanges(quiet)).toBe(false); expect(quiet.unchanged).toBe(1);
  expect(await w.tree()).toEqual(before);
  w.drive.update('doc-a', { doc: doc('doc-a', 'v2'), modifiedTime: '2026-10-21T10:00:00+02:00' });
  expect((await w.run()).changed).toHaveLength(1);
  expect((await w.page('foreningen/doc-a.md')).meta.updatedAt).toBe('2026-10-21T08:00:00.000Z');
});

test('en sektion, der fjernes fra konfigurationen, og løse filer ryddes op; _redirects.json bevares', async () => {
  const w = await world({ arkiv: { type: 'guide', accepts: ['gdoc'] } });
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', doc('doc-a')); w.drive.gdoc('doc-b', 'B', 'f-arkiv', doc('doc-b'));
  await w.run();
  await mkdir(join(w.contentDir, 'ukendt'), { recursive: true }); await writeFile(join(w.contentDir, 'ukendt/noter.txt'), 'x\n');
  await writeFile(join(w.contentDir, '_redirects.json'), '{"/gammel/": "/foreningen/a/"}\n');
  const smaller = config();
  await rejects(readContent(w.contentDir, smaller), /content\/arkiv: hører ikke til en konfigureret sektion/);
  const report = await w.run(false, smaller);
  expect(report.removed).toEqual([
    { section: 'arkiv', title: '(mappe uden for de konfigurerede sektioner)', message: '1 filer fjernet' },
    { section: 'ukendt', title: '(mappe uden for de konfigurerede sektioner)', message: '1 filer fjernet' }]);
  expect(Object.keys(await w.tree())).toEqual(['_redirects.json', '_slugs.json', 'foreningen/doc-a.md']);
  expect(await readFile(join(w.contentDir, '_redirects.json'), 'utf8')).toBe('{"/gammel/": "/foreningen/a/"}\n');
  expect(Object.keys(await w.json('_slugs.json'))).toEqual(['doc-a', 'doc-b']);
  expect((await readContent(w.contentDir, smaller)).entries.size).toBe(1);
});

test('to aktive sider med samme adresse i en håndrettet _slugs.json stopper kørslen', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', doc('doc-a')); w.drive.gdoc('doc-b', 'B', 'f-foreningen', doc('doc-b'));
  await w.run();
  const slugs = await w.json('_slugs.json'); slugs['doc-b'].slug = 'a';
  await writeFile(join(w.contentDir, '_slugs.json'), JSON.stringify(slugs));
  await rejects(w.run(), /deler adresse/);
});
