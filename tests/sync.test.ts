import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { digest } from '../lib/contracts/content';
import { siteConfigSchema } from '../lib/sync/config';
import { GDOC } from '../lib/sync/drive';
import { hasChanges, renderReport } from '../lib/sync/report';
import { setSlug, slugify, slugsSchema } from '../lib/sync/slugs';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { FakeDrive, pdfBytes } from './helpers/fake-drive';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const config = (extra: Record<string, unknown> = {}) => siteConfigSchema.parse({
  rootFolderId: 'root',
  sections: { foreningen: { type: 'guide', category: 'foreningen', accepts: ['gdoc'] }, dokumenter: { type: 'document', accepts: ['pdf'] }, nyheder: { type: 'notice', source: 'sheet' }, ...extra },
  ignoredFolders: ['kalender', 'redaktion'],
});
async function world(extra: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'gv-sync-')); roots.push(dir);
  const drive = new FakeDrive();
  for (const name of ['foreningen', 'dokumenter', 'nyheder', 'kalender', 'redaktion', ...Object.keys(extra)]) drive.folder(`f-${name}`, name, 'root');
  drive.folder('internt', 'Bestyrelsen internt', 'elsewhere');
  const contentDir = join(dir, 'content'), cfg = config(extra);
  const run = (allowMassRemoval = false) => syncContent({ config: cfg, drive, contentDir, allowMassRemoval, now: new Date('2026-10-21T20:00:00Z') });
  const tree = async () => Object.fromEntries(await Promise.all((await walk(contentDir).catch(() => [])).sort().map(async p => [relative(contentDir, p), digest(await readFile(p))])));
  const json = async (path: string) => JSON.parse(await readFile(join(contentDir, path), 'utf8'));
  return { drive, contentDir, run, tree, json };
}

test('kun filer direkte i en sektionsmappe publiceres; resten rapporteres eller ignoreres', async () => {
  const w = await world();
  w.drive.pdf('doc-a', 'Vedtægter.pdf', 'f-dokumenter');
  w.drive.pdf('root-pdf', 'ROOT_CANARY.pdf', 'root', pdfBytes('ROOT_CANARY'));
  w.drive.pdf('red-pdf', 'REDAKTION_CANARY.pdf', 'f-redaktion', pdfBytes('REDAKTION_CANARY'));
  w.drive.folder('sub', 'Arkiv', 'f-dokumenter');
  w.drive.pdf('sub-pdf', 'SUB_CANARY.pdf', 'sub', pdfBytes('SUB_CANARY'));
  w.drive.pdf('private', 'PRIVATE_CANARY.pdf', 'internt', pdfBytes('PRIVATE_CANARY'));
  w.drive.file('doc-gdoc', 'Notat', 'f-dokumenter', GDOC);
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'dokumenter/doc-a.json', 'dokumenter/doc-a.pdf']);
  expect(await w.json('_slugs.json')).toEqual({ 'doc-a': { section: 'dokumenter', slug: 'vedtaegter', previousPaths: [] } });
  expect((await w.json('dokumenter/doc-a.json')).title).toBe('Vedtægter');
  for (const path of await walk(w.contentDir)) expect((await readFile(path)).toString()).not.toMatch(/CANARY/);
  expect(report.warnings.map(x => x.message)).toEqual(expect.arrayContaining([
    'Fil direkte i roden; publiceres ikke', 'Undermappe; indholdet publiceres ikke', `Filtypen ${GDOC} accepteres ikke i dokumenter`]));
  expect(JSON.stringify(report)).not.toMatch(/REDAKTION_CANARY|SUB_CANARY|PRIVATE_CANARY/);
  expect(report.added).toHaveLength(1); expect(report.skippedSections).toEqual(['nyheder']);
  expect(renderReport(report)).toContain('1 nye, 0 ændrede, 0 fjernede');
});

test('genvej publicerer målfilens bytes med målfilens ID og genvejens navn', async () => {
  const w = await world();
  const bytes = pdfBytes('vedtægter v3');
  w.drive.pdf('target-1', 'Vedtaegter_endelig_v3.pdf', 'internt', bytes);
  w.drive.shortcut('shortcut-1', 'Vedtægter', 'f-dokumenter', 'target-1');
  await w.run();
  expect(await readFile(join(w.contentDir, 'dokumenter/target-1.pdf'))).toEqual(bytes);
  expect(await w.json('dokumenter/target-1.json')).toMatchObject({ id: 'target-1', title: 'Vedtægter', sha256: digest(bytes) });
  expect(Object.keys(await w.tree())).not.toContain('dokumenter/shortcut-1.pdf');
  // Renaming the internal target does not change the published title or URL.
  w.drive.update('target-1', { name: 'Vedtaegter_endelig_v4.pdf' });
  expect(hasChanges(await w.run())).toBe(false);
});

test('fjernet genvej fjerner PDF og metadata, men bevarer slug til en senere genkomst', async () => {
  const w = await world();
  w.drive.pdf('target-1', 'intern.pdf', 'internt');
  w.drive.shortcut('shortcut-1', 'Husorden', 'f-dokumenter', 'target-1');
  await w.run();
  w.drive.files.delete('shortcut-1');
  const report = await w.run();
  expect(report.removed).toEqual([{ section: 'dokumenter', id: 'target-1', title: 'Husorden' }]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json']);
  expect((await w.json('_slugs.json'))['target-1'].slug).toBe('husorden');
});

test('omdøbning bevarer URL; flytning mellem sektioner giver en tidligere sti', async () => {
  const w = await world({ arkiv: { type: 'document', accepts: ['pdf'] } });
  w.drive.pdf('doc-a', 'Referat marts.pdf', 'f-dokumenter');
  await w.run();
  w.drive.update('doc-a', { name: 'Referat fra marts 2026.pdf' });
  const renamed = await w.run();
  expect(renamed.changed).toHaveLength(1);
  expect((await w.json('_slugs.json'))['doc-a']).toEqual({ section: 'dokumenter', slug: 'referat-marts', previousPaths: [] });
  w.drive.update('doc-a', { parent: 'f-arkiv' });
  await w.run();
  expect((await w.json('_slugs.json'))['doc-a']).toEqual({ section: 'arkiv', slug: 'referat-marts', previousPaths: ['/dokumenter/referat-marts/'] });
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'arkiv/doc-a.json', 'arkiv/doc-a.pdf']);
});

test('manuelt ændret slug flytter den gamle sti til previousPaths og afviser kollisioner', () => {
  const slugs = slugsSchema.parse({ a: { section: 'dokumenter', slug: 'vedtaegter', previousPaths: [] }, b: { section: 'dokumenter', slug: 'husorden', previousPaths: ['/dokumenter/gammel/'] } });
  expect(setSlug(slugs, 'a', 'vedtaegter-2026').a).toEqual({ section: 'dokumenter', slug: 'vedtaegter-2026', previousPaths: ['/dokumenter/vedtaegter/'] });
  expect(() => setSlug(slugs, 'a', 'husorden')).toThrow('bruges allerede');
  expect(() => setSlug(slugs, 'a', 'gammel')).toThrow('bruges allerede');
  expect(() => setSlug(slugs, 'a', '../x')).toThrow();
  expect(slugify('Ærø, Øster & Åbo — 2026!', 'X')).toBe('aeroe-oester-aabo-2026');
  expect(slugify('???', 'Ab_Cd-1234567')).toBe('side-abcd1234');
});

test('slug-kollision publicerer kun den første; den anden rapporteres', async () => {
  const w = await world();
  w.drive.pdf('doc-a', 'Referat.pdf', 'f-dokumenter');
  w.drive.pdf('doc-b', 'referat.pdf', 'f-dokumenter');
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'dokumenter/doc-a.json', 'dokumenter/doc-a.pdf']);
  expect(report.errors).toEqual([{ section: 'dokumenter', id: 'doc-b', title: 'referat', message: 'Adressen /dokumenter/referat/ bruges allerede; publiceres ikke' }]);
  expect(Object.keys(await w.json('_slugs.json'))).toEqual(['doc-a']);
});

test('et dokument, der vender tilbage til en overtaget adresse, publiceres ikke; resten fortsætter', async () => {
  const w = await world();
  w.drive.pdf('doc-old', 'Husorden.pdf', 'f-dokumenter');
  await w.run();
  w.drive.files.delete('doc-old');
  w.drive.pdf('doc-new', 'Husorden.pdf', 'f-dokumenter');
  await w.run();
  w.drive.pdf('doc-old', 'Husorden.pdf', 'f-dokumenter');
  const report = await w.run();
  expect(report.errors).toEqual([{ section: 'dokumenter', id: 'doc-old', title: 'Husorden', message: 'Adressen /dokumenter/husorden/ bruges allerede; publiceres ikke' }]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'dokumenter/doc-new.json', 'dokumenter/doc-new.pdf']);
});

test('genvej til mappe, genvej uden adgang og dobbelt mål publiceres ikke', async () => {
  const w = await world();
  w.drive.shortcut('sc-folder', 'Hele arkivet', 'f-dokumenter', 'internt', 'application/vnd.google-apps.folder');
  w.drive.pdf('secret', 'secret.pdf', 'internt'); w.drive.denied.add('secret');
  w.drive.shortcut('sc-denied', 'Hemmelig', 'f-dokumenter', 'secret');
  w.drive.pdf('twice', 'twice.pdf', 'internt');
  w.drive.shortcut('sc-1', 'Kopi 1', 'f-dokumenter', 'twice'); w.drive.shortcut('sc-2', 'Kopi 2', 'f-dokumenter', 'twice');
  const report = await w.run();
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json']);
  expect(report.warnings.map(x => x.message)).toContain('Genvej til en mappe; publiceres ikke');
  expect(report.errors.map(x => x.message)).toEqual(['Synkroniseringskontoen kan ikke læse målfilen',
    'Samme fil optræder flere gange, eller ID kolliderer med et andet ID', 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID']);
});

test('fejl i listning eller manglende sektionsmappe ændrer intet', async () => {
  const w = await world();
  w.drive.pdf('doc-a', 'A.pdf', 'f-dokumenter'); w.drive.pdf('doc-b', 'B.pdf', 'f-dokumenter');
  await w.run();
  const before = await w.tree();
  w.drive.failList.add('f-dokumenter');
  await rejects(w.run(), /HTTP 500/);
  w.drive.failList.clear(); w.drive.failList.add('root');
  await rejects(w.run(), /HTTP 500/);
  w.drive.failList.clear(); w.drive.files.delete('f-nyheder');
  await rejects(w.run(), /"nyheder" mangler/);
  expect(await w.tree()).toEqual(before);
  expect(await Bun.file(join(w.contentDir, '../.sync/lock')).exists()).toBe(false);
});

test('ulæseligt mål, fejlet download og ugyldig PDF beholder sidste gyldige version', async () => {
  const w = await world();
  w.drive.pdf('target', 'intern.pdf', 'internt'); w.drive.shortcut('sc', 'Vedtægter', 'f-dokumenter', 'target');
  w.drive.pdf('doc-b', 'Husorden.pdf', 'f-dokumenter'); w.drive.pdf('doc-c', 'Budget.pdf', 'f-dokumenter');
  await w.run();
  const before = await w.tree();
  w.drive.update('target', { bytes: pdfBytes('ny version') }); w.drive.denied.add('target');
  w.drive.update('doc-b', { bytes: pdfBytes('ny husorden') }); w.drive.failDownload.add('doc-b');
  w.drive.update('doc-c', { bytes: Buffer.from('<html>ikke en pdf</html>') });
  w.drive.pdf('doc-d', 'Nyt dokument.pdf', 'f-dokumenter');
  const report = await w.run();
  expect(report.errors.map(e => e.id)).toEqual(['target', 'doc-b', 'doc-c']);
  expect(report.removed).toEqual([]); expect(report.added.map(a => a.id)).toEqual(['doc-d']);
  const after = await w.tree();
  for (const [path, hash] of Object.entries(before)) if (path !== '_slugs.json') expect(after[path]).toBe(hash);
});

test('mål i papirkurven fjernes med en advarsel', async () => {
  const w = await world();
  w.drive.pdf('target', 'intern.pdf', 'internt'); w.drive.shortcut('sc', 'Vedtægter', 'f-dokumenter', 'target');
  await w.run();
  w.drive.update('target', { trashed: true });
  const report = await w.run();
  expect(report.removed.map(r => r.id)).toEqual(['target']);
  expect(report.warnings.map(x => x.message)).toContain('Målfilen ligger i papirkurven; siden fjernes');
});

test('masseudtagning kræver eksplicit tilladelse', async () => {
  const w = await world();
  for (const id of ['a1', 'a2', 'a3']) w.drive.pdf(id, `${id}.pdf`, 'f-dokumenter');
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
  w.drive.pdf('doc-a', 'A.pdf', 'f-dokumenter', pdfBytes('v1'), '2026-10-01T08:00:00Z');
  await w.run();
  const before = await w.tree();
  w.drive.update('doc-a', { modifiedTime: '2026-10-21T09:00:00Z' });
  const quiet = await w.run();
  expect(hasChanges(quiet)).toBe(false); expect(quiet.unchanged).toBe(1);
  expect(await w.tree()).toEqual(before);
  w.drive.update('doc-a', { bytes: pdfBytes('v2'), modifiedTime: '2026-10-21T10:00:00+02:00' });
  expect((await w.run()).changed).toHaveLength(1);
  expect((await w.json('dokumenter/doc-a.json')).updatedAt).toBe('2026-10-21T08:00:00.000Z');
});

test('andre sektioner og manuelle filer i content/ bevares uændret', async () => {
  const w = await world();
  await mkdir(join(w.contentDir, 'nyheder'), { recursive: true });
  await writeFile(join(w.contentDir, 'nyheder/nyheder.json'), '[]\n');
  await writeFile(join(w.contentDir, '_redirects.json'), '{"/gammel/": "/ny/"}\n');
  w.drive.pdf('doc-a', 'A.pdf', 'f-dokumenter');
  await w.run();
  expect(await readFile(join(w.contentDir, 'nyheder/nyheder.json'), 'utf8')).toBe('[]\n');
  expect(await readFile(join(w.contentDir, '_redirects.json'), 'utf8')).toBe('{"/gammel/": "/ny/"}\n');
});

test('to aktive sider med samme adresse i en håndrettet _slugs.json stopper kørslen', async () => {
  const w = await world();
  w.drive.pdf('doc-a', 'A.pdf', 'f-dokumenter'); w.drive.pdf('doc-b', 'B.pdf', 'f-dokumenter');
  await w.run();
  const slugs = await w.json('_slugs.json'); slugs['doc-b'].slug = 'a';
  await writeFile(join(w.contentDir, '_slugs.json'), JSON.stringify(slugs));
  await rejects(w.run(), /deler adresse/);
});
