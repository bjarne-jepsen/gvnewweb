import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { digest } from '../lib/contracts/content';
import { siteConfigSchema } from '../lib/sync/config';
import { splitFrontmatter } from '../lib/sync/markdown';
import { hasChanges } from '../lib/sync/report';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive, png } from './helpers/fake-drive';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function world() {
  const dir = await mkdtemp(join(tmpdir(), 'gv-docs-')); roots.push(dir);
  const drive = new FakeDrive();
  for (const name of ['foreningen', 'vejledninger', 'dokumenter', 'nyheder']) drive.folder(`f-${name}`, name, 'root');
  drive.folder('internt', 'Internt', 'elsewhere');
  const config = siteConfigSchema.parse({ rootFolderId: 'root', sections: {
    foreningen: { type: 'guide', category: 'foreningen', accepts: ['gdoc'] }, vejledninger: { type: 'guide', category: 'vejledning', accepts: ['gdoc'] },
    dokumenter: { type: 'document', accepts: ['pdf'] }, nyheder: { type: 'notice', source: 'sheet' } } });
  const contentDir = join(dir, 'content');
  const run = () => syncContent({ config, drive, contentDir, now: new Date('2026-10-21T20:00:00Z') });
  const tree = async () => Object.fromEntries(await Promise.all((await walk(contentDir).catch(() => [])).sort().map(async p => [relative(contentDir, p), digest(await readFile(p))])));
  const page = async (path: string) => splitFrontmatter(await readFile(join(contentDir, path), 'utf8'));
  return { drive, contentDir, run, tree, page };
}
const simple = (id: string, text = 'Første afsnit er resuméet.') => docJson(id, [
  { text: 'Velkommen', style: 'HEADING_1' }, { text }, { text: 'Vigtigt', bold: true }, { text: 'Punkt et', bullet: true }, { text: 'Punkt to', bullet: true },
  { text: 'Læs mere', href: 'https://groendalsvaenge.dk/' }, { text: 'Underafsnit', style: 'HEADING_2' }]);

test('Google Docs bliver til Markdown med frontmatter; titel fra filnavnet', async () => {
  const w = await world();
  w.drive.gdoc('doc-1', 'Om foreningen', 'f-foreningen', simple('doc-1'));
  const report = await w.run();
  expect(report.added).toEqual([{ section: 'foreningen', id: 'doc-1', title: 'Om foreningen' }]);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'foreningen/doc-1.md']);
  const { meta, body } = await w.page('foreningen/doc-1.md');
  expect(meta).toEqual({ id: 'doc-1', title: 'Om foreningen', updatedAt: '2026-10-21T08:00:00.000Z', summary: 'Første afsnit er resuméet.' });
  expect(body).toBe('## Velkommen\n\nFørste afsnit er resuméet.\n\n**Vigtigt**\n\n- Punkt et\n- Punkt to\n\n[Læs mere](https://groendalsvaenge.dk/)\n\n### Underafsnit\n');
  expect(body).not.toContain('intern titel');
});

test('genvej til et dokument giver målets indhold med genvejens navn', async () => {
  const w = await world();
  w.drive.gdoc('target', 'Lokaleleje_intern_v3', 'internt', simple('target', 'Sådan lejer du lokalerne.'));
  w.drive.shortcut('sc', 'Leje af lokaler', 'f-vejledninger', 'target', 'application/vnd.google-apps.document');
  await w.run();
  expect((await w.page('vejledninger/target.md')).meta).toMatchObject({ id: 'target', title: 'Leje af lokaler', summary: 'Sådan lejer du lokalerne.' });
});

test('forslag i et svar afviser dokumentet; sidste gyldige version beholdes', async () => {
  const w = await world();
  w.drive.gdoc('doc-1', 'Om foreningen', 'f-foreningen', simple('doc-1'));
  await w.run();
  const before = await w.tree();
  const leaked = simple('doc-1', 'FORSLAGINDSAT');
  ((leaked.tabs[0]!.documentTab.body.content[2] as any).paragraph.elements[0].textRun).suggestedInsertionIds = ['suggest.1'];
  w.drive.update('doc-1', { doc: leaked });
  const report = await w.run();
  expect(report.errors).toEqual([{ section: 'foreningen', id: 'doc-1', title: 'Om foreningen', message: 'Google Docs: løs forslag før import; sidste gyldige version beholdes' }]);
  expect(await w.tree()).toEqual(before);
});

test('et dokument, der ikke kan konverteres, beholder sidste version; de andre synkroniseres', async () => {
  const w = await world();
  w.drive.gdoc('doc-a', 'A', 'f-foreningen', simple('doc-a')); w.drive.gdoc('doc-b', 'B', 'f-vejledninger', simple('doc-b'));
  await w.run();
  const before = await w.tree();
  const twoTabs = simple('doc-a', 'Ny tekst'); twoTabs.tabs.push(structuredClone(twoTabs.tabs[0]!));
  w.drive.update('doc-a', { doc: twoTabs });
  w.drive.update('doc-b', { doc: simple('doc-b', 'Opdateret tekst') });
  const numbered = simple('doc-c'); numbered.tabs[0]!.documentTab.lists['kix.1'].listProperties.nestingLevels[0] = { glyphType: 'DECIMAL' } as never;
  w.drive.gdoc('doc-c', 'C', 'f-vejledninger', numbered);
  w.drive.gdoc('doc-d', 'D', 'f-vejledninger', docJson('doc-d', [{ text: 'Billede:' }, { text: '', image: 'img' }], { img: { uri: 'https://lh3.googleusercontent.com/x' } }));
  w.drive.images.set('https://lh3.googleusercontent.com/x', png);
  w.drive.gdoc('doc-e', 'E', 'f-vejledninger', { ...simple('doc-e'), documentId: 'other' });
  const report = await w.run();
  expect(report.errors.map(e => [e.id, e.message])).toEqual([
    ['doc-a', 'Google Docs: piloten kræver præcis én fane uden underfaner; sidste gyldige version beholdes'],
    ['doc-c', 'Google Docs: nummererede lister understøttes ikke; sidste gyldige version beholdes'],
    ['doc-d', 'Et billede mangler alternativ tekst (højreklik på billedet → Alternativ tekst); sidste gyldige version beholdes'],
    ['doc-e', 'Google Docs: forkert eller ugyldigt dokument; sidste gyldige version beholdes']]);
  expect(report.changed.map(c => c.id)).toEqual(['doc-b']);
  const after = await w.tree();
  expect(after['foreningen/doc-a.md']).toBe(before['foreningen/doc-a.md']);
  expect(Object.keys(after)).toEqual(['_slugs.json', 'foreningen/doc-a.md', 'vejledninger/doc-b.md']);
  expect((await w.page('vejledninger/doc-b.md')).meta.summary).toBe('Opdateret tekst');
});

test('billeder gemmes pr. dokument med bevarede bytes og fjernes sammen med dokumentet', async () => {
  const w = await world();
  w.drive.images.set('https://lh3.googleusercontent.com/kort', png);
  w.drive.gdoc('doc-1', 'Kort', 'f-vejledninger', docJson('doc-1', [{ text: 'Se kortet.' }, { text: '', image: 'i1' }, { text: '', image: 'i2' }],
    { i1: { uri: 'https://lh3.googleusercontent.com/kort', alt: 'Kort over området' }, i2: { uri: 'https://lh3.googleusercontent.com/kort', alt: 'Samme kort' } }));
  await w.run();
  const name = `${digest(png).slice(7, 23)}.png`;
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json', 'vejledninger/doc-1.md', `vejledninger/doc-1/${name}`]);
  expect(await readFile(join(w.contentDir, 'vejledninger/doc-1', name))).toEqual(png);
  expect((await w.page('vejledninger/doc-1.md')).body).toBe(`Se kortet.\n\n![Kort over området](./doc-1/${name})\n\n![Samme kort](./doc-1/${name})\n`);
  w.drive.files.delete('doc-1');
  expect((await w.run()).removed.map(r => r.id)).toEqual(['doc-1']);
  expect(Object.keys(await w.tree())).toEqual(['_slugs.json']);
});

test('updatedAt følger indholdet; uændret kørsel er byte-identisk', async () => {
  const w = await world();
  w.drive.gdoc('doc-1', 'A', 'f-foreningen', simple('doc-1'));
  await w.run();
  const before = await w.tree();
  w.drive.update('doc-1', { modifiedTime: '2026-10-22T09:00:00Z' });
  expect(hasChanges(await w.run())).toBe(false);
  expect(await w.tree()).toEqual(before);
  w.drive.update('doc-1', { doc: simple('doc-1', 'Ny tekst') });
  await w.run();
  expect((await w.page('foreningen/doc-1.md')).meta.updatedAt).toBe('2026-10-22T09:00:00.000Z');
});

test('håndrettet rå HTML i content/ stopper kørslen uden ændringer', async () => {
  const w = await world();
  w.drive.gdoc('doc-1', 'A', 'f-foreningen', simple('doc-1'));
  await w.run();
  const path = join(w.contentDir, 'foreningen/doc-1.md');
  await writeFile(path, (await readFile(path, 'utf8')) + '\n<script>alert(1)</script>\n');
  const before = await w.tree();
  await rejects(w.run(), /ikke-tilladte elementer: html/);
  expect(await w.tree()).toEqual(before);
});
