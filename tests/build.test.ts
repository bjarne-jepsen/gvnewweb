import { afterAll, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../lib/sync/content';
import { siteConfigSchema } from '../lib/sync/config';
import { serializeSlugs, setSlug, slugsSchema } from '../lib/sync/slugs';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive, pdfBytes, png } from './helpers/fake-drive';

const root = await mkdtemp(join(tmpdir(), 'gv-build-'));
afterAll(() => rm(root, { recursive: true, force: true }));
const config = { rootFolderId: 'root', sections: {
  foreningen: { type: 'guide', category: 'foreningen', accepts: ['gdoc'] }, vejledninger: { type: 'guide', category: 'vejledning', accepts: ['gdoc'] },
  dokumenter: { type: 'document', accepts: ['pdf'] }, nyheder: { type: 'notice', source: 'sheet' } }, ignoredFolders: ['redaktion'] };
const drive = new FakeDrive();
const sync = () => syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
async function build() {
  const proc = Bun.spawn([process.execPath, 'run', 'scripts/build.ts'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exit, log: stdout + stderr };
}
const dist = (path: string) => join(root, 'dist', path);
const html = (path: string) => readFile(dist(path), 'utf8');
const exists = (path: string) => Bun.file(dist(path)).exists();
async function release() {
  const paths = (await walk(join(root, 'dist'))).sort();
  return Promise.all(paths.map(async p => [p.slice(root.length), digest(await readFile(p))]));
}
async function expectGreen() { const r = await build(); expect(r.log).toContain('Outputkontrol bestået'); expect(r.exit).toBe(0); return r; }

test('sync → build: kun sektionernes indhold publiceres; URL\'er, redirects og fjernelse virker; fejl bevarer dist', async () => {
  for (const path of ['src', 'lib', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(path, join(root, path), { recursive: true });
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  for (const name of ['foreningen', 'vejledninger', 'dokumenter', 'nyheder', 'redaktion']) drive.folder(`f-${name}`, name, 'root');
  drive.folder('internt', 'Internt', 'elsewhere');
  const vedtaegter = pdfBytes('vedtægter v3');
  drive.pdf('target-pdf', 'Vedtaegter_endelig_v3.pdf', 'internt', vedtaegter);
  drive.shortcut('sc-pdf', 'Vedtægter', 'f-dokumenter', 'target-pdf');
  drive.images.set('https://lh3.googleusercontent.com/kort', png);
  const doc = (title: string) => docJson('doc-1', [{ text: title, style: 'HEADING_1' }, { text: 'Første afsnit.' }, { text: '', image: 'i1' }], { i1: { uri: 'https://lh3.googleusercontent.com/kort', alt: 'Kort over området' } });
  drive.gdoc('doc-1', 'Om foreningen', 'f-foreningen', doc('Velkommen'));
  drive.pdf('private', 'PRIVATE_CANARY.pdf', 'internt', pdfBytes('PRIVATE_CANARY'));
  drive.pdf('red', 'REDAKTION_CANARY.pdf', 'f-redaktion', pdfBytes('REDAKTION_CANARY'));
  drive.pdf('rootfile', 'ROOT_CANARY.pdf', 'root', pdfBytes('ROOT_CANARY'));
  await sync();
  await expectGreen();

  // 1. Pages, unchanged bytes, nothing from outside the section folders.
  const image = `${digest(png).slice(7, 23)}.png`;
  expect(await html('dokumenter/vedtaegter/index.html')).toContain('href="/dokumenter/vedtaegter.pdf"');
  expect(await readFile(dist('dokumenter/vedtaegter.pdf'))).toEqual(vedtaegter);
  const page = await html('foreningen/om-foreningen/index.html');
  expect(page).toContain('<h1>Om foreningen</h1>'); expect(page).toContain('<h2>Velkommen</h2>');
  expect(page).toContain(`<img src="/foreningen/om-foreningen/${image}" alt="Kort over området"`);
  expect(await readFile(dist(`foreningen/om-foreningen/${image}`))).toEqual(png);
  for (const path of await walk(join(root, 'dist'))) expect((await readFile(path)).toString()).not.toMatch(/CANARY|target-pdf|doc-1/);
  expect(JSON.parse(await html('search.json')).map((x: { url: string }) => x.url).sort()).toEqual(['/dokumenter/vedtaegter/', '/foreningen/om-foreningen/']);

  // 2. Renaming keeps the URL and changes the title.
  drive.update('doc-1', { name: 'Om Grøndalsvænge', modifiedTime: '2026-10-22T08:00:00Z' });
  await sync(); await expectGreen();
  expect(await html('foreningen/om-foreningen/index.html')).toContain('<h1>Om Grøndalsvænge</h1>');

  // 3. A manual slug change leaves a redirect at the old path, outside the sitemap.
  const slugsPath = join(root, 'content/_slugs.json');
  await writeFile(slugsPath, serializeSlugs(setSlug(slugsSchema.parse(JSON.parse(await readFile(slugsPath, 'utf8'))), 'doc-1', 'om-os')));
  await expectGreen();
  expect(await exists('foreningen/om-os/index.html')).toBe(true);
  expect(await exists(`foreningen/om-os/${image}`)).toBe(true);
  expect(await html('foreningen/om-foreningen/index.html')).toContain('url=/foreningen/om-os/"');
  expect(await html('sitemap.xml')).not.toContain('om-foreningen');

  // 4. Manual WordPress redirects; a missing target is skipped with a warning.
  await writeFile(join(root, 'content/_redirects.json'), JSON.stringify({ '/andelshaveren/byggeprojekter/': '/foreningen/om-os/', '/gammel/': '/findes-ikke/' }));
  const warned = await expectGreen();
  expect(warned.log).toContain('/gammel/ → /findes-ikke/ springes over');
  expect(await html('andelshaveren/byggeprojekter/index.html')).toContain('url=/foreningen/om-os/"');
  expect(await exists('gammel/index.html')).toBe(false);

  // 5. Errors keep the last valid dist: a redirect over a live page, hand-written HTML in content/.
  const valid = await release();
  await writeFile(join(root, 'content/_redirects.json'), JSON.stringify({ '/dokumenter/': '/foreningen/om-os/' }));
  let result = await build(); expect(result.exit).not.toBe(0); expect(result.log).toContain('rammer en eksisterende side');
  expect(await release()).toEqual(valid);
  await rm(join(root, 'content/_redirects.json'));
  const mdPath = join(root, 'content/foreningen/doc-1.md'), original = await readFile(mdPath, 'utf8');
  await writeFile(mdPath, `${original}\n<script>alert(1)</script>\n`);
  result = await build(); expect(result.exit).not.toBe(0); expect(result.log).toContain('ikke-tilladte elementer');
  expect(await release()).toEqual(valid);
  await writeFile(mdPath, original);

  // 6. Removing the shortcut removes the page and its PDF from dist.
  drive.files.delete('sc-pdf');
  await sync(); await expectGreen();
  expect(await exists('dokumenter/vedtaegter/index.html')).toBe(false);
  expect(await exists('dokumenter/vedtaegter.pdf')).toBe(false);
  expect(await html('dokumenter/index.html')).toContain('Der er ingen offentliggjorte elementer her endnu.');
}, 90000);
