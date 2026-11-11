import { afterEach, describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { digest } from '../lib/sync/content';
import { siteConfigSchema } from '../lib/sync/config';
import { parseDate } from '../lib/sync/news';
import { hasChanges } from '../lib/sync/report';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive, png } from './helpers/fake-drive';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
type Paras = Parameters<typeof docJson>[1];
async function world() {
  const dir = await mkdtemp(join(tmpdir(), 'gv-news-')); roots.push(dir);
  const drive = new FakeDrive();
  drive.folder('f-nyheder', '90 Nyheder', 'root');
  drive.folder('f-kladder', 'Nyhedskladder', 'root');
  const add = (id: string, name: string, paras: Paras, parent = 'f-nyheder') => drive.gdoc(id, name, parent, docJson(id, paras));
  add('nh-gf', 'Generalforsamling', [
    { text: 'Dato: 21.10.2026' }, { text: 'Indkaldelse og dagsorden.' }, { text: 'Dagsorden', style: 'HEADING_1' },
    { text: 'Valg af dirigent', bullet: true }, { text: 'Beretning', bullet: true },
    { text: 'Læs mere', href: 'https://groendalsvaenge.dk/gf' }, { text: 'Søgeord: GF, årsmøde' }]);
  add('nh-vand', 'Vandet lukkes', [{ text: 'Vises til: 31. oktober 2026' }, { text: 'Mandag kl. 9-12.' }]);
  add('nh-kladde', 'DRAFT_CANARY', [{ text: 'Ikke klar endnu.' }], 'f-kladder');
  const config = siteConfigSchema.parse({ rootFolderId: 'root' });
  const contentDir = join(dir, 'content');
  let now = new Date('2026-10-21T20:00:00Z');
  const run = (allowMassRemoval = false) => syncContent({ config, drive, contentDir, allowMassRemoval, now });
  const tree = async () => Object.fromEntries(await Promise.all((await walk(contentDir).catch(() => [])).filter(p => !p.endsWith('_sections.json')).sort().map(async p => [relative(contentDir, p), digest(await readFile(p))])));
  const news = async (id: string) => JSON.parse(await readFile(join(contentDir, `nyheder/${id}.json`), 'utf8'));
  const slug = async (id: string) => JSON.parse(await readFile(join(contentDir, '_slugs.json'), 'utf8'))[id]?.slug;
  return { drive, contentDir, run, tree, news, slug, add, setNow: (at: string) => { now = new Date(at); } };
}

test('ét Google-dokument pr. nyhed; Dato, Vises til og Søgeord vises ikke; kladder uden for sektionen publiceres ikke', async () => {
  const w = await world();
  const report = await w.run();
  expect(report.errors).toEqual([]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'nyheder/nh-gf.json', 'nyheder/nh-vand.json']);
  for (const path of await walk(w.contentDir)) expect(await readFile(path, 'utf8')).not.toMatch(/CANARY/);
  expect(await w.news('nh-gf')).toEqual({
    id: 'nh-gf', title: 'Generalforsamling', date: '2026-10-21', summary: 'Indkaldelse og dagsorden.',
    body: 'Indkaldelse og dagsorden.\n\n## Dagsorden\n\n- Valg af dirigent\n- Beretning\n\n[Læs mere](https://groendalsvaenge.dk/gf)\n',
    updatedAt: '2026-10-21T08:00:00.000Z', keywords: ['GF', 'årsmøde'] });
  // No "Dato:" line: the day of the first publication, in Danish time.
  expect(await w.news('nh-vand')).toMatchObject({ date: '2026-10-21', expires: '2026-10-31', body: 'Mandag kl. 9-12.\n' });
  expect(await w.slug('nh-gf')).toBe('2026-10-21-generalforsamling');
});

test('uden Dato-linje beholder nyheden datoen fra første publicering, også når teksten rettes', async () => {
  const w = await world();
  await w.run();
  w.setNow('2026-11-05T10:00:00Z');
  expect(hasChanges(await w.run())).toBe(false);
  w.drive.update('nh-vand', { doc: docJson('nh-vand', [{ text: 'Mandag kl. 9-14.' }]), modifiedTime: '2026-11-05T09:00:00Z' });
  const report = await w.run();
  expect(report.changed.map(c => c.id)).toEqual(['nh-vand']);
  expect(await w.news('nh-vand')).toMatchObject({ date: '2026-10-21', body: 'Mandag kl. 9-14.\n' });
  expect(await w.news('nh-vand')).not.toHaveProperty('expires');
  // A new item without a date gets today's; one with a date in the future keeps it and is filtered at build.
  w.add('nh-ny', 'Fastelavn', [{ text: 'Tøndeslagning.' }]);
  w.add('nh-snart', 'Juletræ', [{ text: 'Dato: 2026-12-01' }, { text: 'Vi tænder træet.' }]);
  await w.run();
  expect([(await w.news('nh-ny')).date, (await w.news('nh-snart')).date]).toEqual(['2026-11-05', '2026-12-01']);
  expect(await w.slug('nh-ny')).toBe('2026-11-05-fastelavn');
});

test('fejl i et dokument beholder sidste version; resten synkroniseres', async () => {
  const w = await world();
  await w.run();
  const before = await w.tree();
  w.drive.update('nh-gf', { doc: docJson('nh-gf', [{ text: 'Dato: i morgen' }, { text: 'Ny tekst' }]) });
  w.drive.update('nh-vand', { doc: docJson('nh-vand', [{ text: 'Dato: 21.10.2026' }, { text: 'Vises til: 1.10.2026' }, { text: 'Ny tekst' }]) });
  w.drive.images.set('https://lh3.googleusercontent.com/x', png);
  w.drive.gdoc('nh-billede', 'Med billede', 'f-nyheder', docJson('nh-billede', [{ text: 'Se her.' }, { text: '', image: 'i1' }], { i1: { uri: 'https://lh3.googleusercontent.com/x', alt: 'Kort' } }));
  w.add('nh-tom', 'Kun dato', [{ text: 'Dato: 22.10.2026' }]);
  w.add('nh-ok', 'Ny nyhed', [{ text: 'Tekst.' }]);
  const report = await w.run();
  expect(report.errors.map(e => [e.id, e.message])).toEqual([
    ['nh-billede', 'Billeder i nyheder understøttes ikke endnu; fjern billedet fra dokumentet; sidste gyldige version beholdes'],
    ['nh-gf', '"Dato: i morgen" er ikke en gyldig dato. Skriv fx Dato: 21.10.2026; sidste gyldige version beholdes'],
    ['nh-tom', 'Nyheden har ingen tekst; sidste gyldige version beholdes'],
    ['nh-vand', '"Vises til" ligger før datoen; sidste gyldige version beholdes']]);
  expect(report.added.map(a => a.id)).toEqual(['nh-ok']);
  const after = await w.tree();
  expect(after['nyheder/nh-gf.json']).toBe(before['nyheder/nh-gf.json']);
  expect(after['nyheder/nh-vand.json']).toBe(before['nyheder/nh-vand.json']);
});

test('andre filtyper giver advarsler; en flyttet kladde fjerner nyheden; tømt mappe kræver tilladelse', async () => {
  const w = await world();
  w.drive.file('ark', 'Gammelt nyhedsark', 'f-nyheder', 'application/vnd.google-apps.spreadsheet');
  expect((await w.run()).warnings.map(x => x.message)).toContain('Filtypen application/vnd.google-apps.spreadsheet accepteres ikke i nyheder');
  w.drive.update('nh-vand', { parent: 'f-kladder' });
  expect((await w.run()).removed.map(r => r.id)).toEqual(['nh-vand']);
  w.drive.update('nh-vand', { parent: 'f-nyheder' }); await w.run();
  w.drive.update('nh-vand', { parent: 'f-kladder' }); w.drive.update('nh-gf', { parent: 'f-kladder' });
  await rejects(w.run(), /2 af 2 filer/);
  expect((await w.run(true)).removed).toHaveLength(2);
});

test('nyhedssektionen er den med adressen /nyheder/; den forbliver det efter omdøbning', async () => {
  const w = await world();
  await w.run();
  w.drive.update('f-nyheder', { name: '90 Nyt fra foreningen' });
  const report = await w.run();
  const sections = JSON.parse(await readFile(join(w.contentDir, '_sections.json'), 'utf8'));
  expect(sections['f-nyheder']).toMatchObject({ key: 'nyheder', label: 'Nyt fra foreningen', kind: 'notice' });
  expect(report.removed).toEqual([]);
});

describe('datoer', () => {
  test('ISO, danske skrivemåder og månedsnavne; ugyldige afvises', () => {
    expect(['21.10.2026', '2026-10-21', '21-10-2026', '21/10/2026', '21. oktober 2026', '21 okt. 2026', '21. Okt 2026', ' 1.2.2027 ', '3. maj 2027', '5. marts 2027'].map(parseDate))
      .toEqual(['2026-10-21', '2026-10-21', '2026-10-21', '2026-10-21', '2026-10-21', '2026-10-21', '2026-10-21', '2027-02-01', '2027-05-03', '2027-03-05']);
    for (const bad of ['30.02.2026', '2026-13-01', 'i morgen', '21.10.26', '', '21. ok 2026', '21. oktobr 2026', '5']) expect([bad, parseDate(bad)]).toEqual([bad, undefined]);
  });
});
