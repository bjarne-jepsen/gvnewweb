import { afterAll, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../lib/sync/content';
import { siteConfigSchema } from '../lib/sync/config';
import { serializeSlugs, setSlug, slugsSchema } from '../lib/sync/slugs';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive, png, sheetJson } from './helpers/fake-drive';

const root = await mkdtemp(join(tmpdir(), 'gv-build-'));
afterAll(() => rm(root, { recursive: true, force: true }));
const config = { rootFolderId: 'root', sections: {
  foreningen: { type: 'guide', accepts: ['gdoc'] }, 'bo-her': { type: 'guide', accepts: ['gdoc'] },
  nyheder: { type: 'notice', source: 'sheet' } }, ignoredFolders: ['redaktion'] };
const canary = (id: string, label: string) => docJson(id, [{ text: label }]);
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
  for (const name of ['foreningen', 'bo-her', 'nyheder', 'redaktion']) drive.folder(`f-${name}`, name, 'root');
  drive.folder('internt', 'Internt', 'elsewhere');
  drive.gdoc('target-doc', 'Lokaleleje_intern_v3', 'internt', docJson('target-doc', [{ text: 'Sådan lejer du lokalerne.' }]));
  drive.shortcut('sc-doc', 'Leje af lokaler', 'f-bo-her', 'target-doc');
  drive.file('a-pdf', 'Vedtægter.pdf', 'f-bo-her', 'application/pdf'); // documents live in ProBo
  drive.images.set('https://lh3.googleusercontent.com/kort', png);
  const doc = (title: string) => docJson('doc-1', [{ text: title, style: 'HEADING_1' }, { text: 'Første afsnit.' }, { text: '', image: 'i1' }], { i1: { uri: 'https://lh3.googleusercontent.com/kort', alt: 'Kort over området' } });
  drive.gdoc('doc-1', 'Om foreningen', 'f-foreningen', doc('Velkommen'));
  drive.gdoc('1Kontakt9xQz', 'Kontakt', 'f-foreningen', docJson('1Kontakt9xQz', [{ text: 'Skriv til foreningen.' }]));
  drive.gdoc('private', 'PRIVATE_CANARY', 'internt', canary('private', 'PRIVATE_CANARY'));
  drive.gdoc('red', 'REDAKTION_CANARY', 'f-redaktion', canary('red', 'REDAKTION_CANARY'));
  drive.gdoc('rootfile', 'ROOT_CANARY', 'root', canary('rootfile', 'ROOT_CANARY'));
  drive.sheet('news', 'Nyheder', 'f-nyheder', sheetJson([['ID', 'Dato', 'Titel', 'Tekst', 'Udløber', 'Status'],
    ['n-live', '2026-10-20', 'Vandet lukkes', 'Mandag kl. 9-12.', '', 'offentlig'],
    ['n-old1', '2026-09-01', 'Ældre nyhed A', 'Tekst', '', 'offentlig'], ['n-old2', '2026-08-01', 'Ældre nyhed B', 'Tekst', '', 'offentlig'],
    ['n-old3', '2026-07-01', 'OLDEST_NEWS', 'Tekst', '', 'offentlig'],
    ['n-expired', '2026-01-10', 'EXPIRED_CANARY', 'Tekst', '2026-01-31', 'offentlig'],
    ['n-future', '2099-01-01', 'FUTURE_CANARY', 'Tekst', '', 'offentlig'],
    ['n-draft', '2026-10-20', 'DRAFT_CANARY', 'Tekst', '', 'kladde']]));
  await sync();
  const first = await expectGreen();

  // 0. Front page and footer: existing shortcut targets only, the three latest news, navigation in config order.
  const home = await html('index.html');
  expect(home).toContain('<ul class="shortcuts"><li><a href="/foreningen/kontakt/">Kontakt</a></li></ul>');
  expect(first.log).toContain('Forsiden: "Sælg dit hus" → /bo-her/saelg-dit-hus/ springes over, fordi siden ikke findes');
  expect([...home.matchAll(/href="(\/nyheder\/[^"]+)"/g)].map(m => m[1])).toEqual(['/nyheder/2026-10-20-vandet-lukkes/', '/nyheder/2026-09-01-aeldre-nyhed-a/', '/nyheder/2026-08-01-aeldre-nyhed-b/']);
  expect(home).not.toContain('OLDEST_NEWS');
  expect(await html('nyheder/index.html')).toContain('OLDEST_NEWS');
  expect(home).toMatch(/<nav aria-label="Sidefod"><ul class="footer-links"><li><a href="\/foreningen\/kontakt\/">Kontakt<\/a><\/li><\/ul><\/nav>/);
  expect([...home.matchAll(/<nav aria-label="Hovednavigation">([\s\S]*?)<\/nav>/g)][0]![1]!.match(/href="([^"]+)"/g)).toEqual(['href="/"', 'href="/foreningen/"', 'href="/bo-her/"', 'href="/nyheder/"']);

  // 1. Pages, unchanged image bytes, nothing from outside the section folders, no PDFs.
  const image = `${digest(png).slice(7, 23)}.png`;
  const shortcutPage = await html('bo-her/leje-af-lokaler/index.html');
  expect(shortcutPage).toContain('<h1>Leje af lokaler</h1>'); expect(shortcutPage).toContain('<p>Sådan lejer du lokalerne.</p>');
  expect((await walk(join(root, 'dist'))).filter(p => /\.pdf$/i.test(p))).toEqual([]);
  const page = await html('foreningen/om-foreningen/index.html');
  expect(page).toContain('<h1>Om foreningen</h1>'); expect(page).toContain('<h2>Velkommen</h2>');
  expect(page).toContain(`<img src="/foreningen/om-foreningen/${image}" alt="Kort over området"`);
  expect(await readFile(dist(`foreningen/om-foreningen/${image}`))).toEqual(png);
  for (const path of await walk(join(root, 'dist'))) expect((await readFile(path)).toString()).not.toMatch(/CANARY|target-doc|doc-1/);
  expect(JSON.parse(await html('search.json')).map((x: { url: string }) => x.url).sort()).toEqual(['/bo-her/leje-af-lokaler/', '/foreningen/kontakt/', '/foreningen/om-foreningen/',
    '/nyheder/2026-07-01-oldest-news/', '/nyheder/2026-08-01-aeldre-nyhed-b/', '/nyheder/2026-09-01-aeldre-nyhed-a/', '/nyheder/2026-10-20-vandet-lukkes/']);
  // News: expired and future rows are in content/ but not built; drafts never reach content/.
  expect(await html('nyheder/2026-10-20-vandet-lukkes/index.html')).toContain('<time datetime="2026-10-20">20. oktober 2026</time>');
  expect(await html('nyheder/index.html')).toContain('Mandag kl. 9-12.');
  expect(await Bun.file(join(root, 'content/nyheder/n-expired.json')).exists()).toBe(true);
  expect(await Bun.file(join(root, 'content/nyheder/n-draft.json')).exists()).toBe(false);

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
  await writeFile(join(root, 'content/_redirects.json'), JSON.stringify({ '/bo-her/': '/foreningen/om-os/' }));
  let result = await build(); expect(result.exit).not.toBe(0); expect(result.log).toContain('rammer en eksisterende side');
  expect(await release()).toEqual(valid);
  await rm(join(root, 'content/_redirects.json'));
  const mdPath = join(root, 'content/foreningen/doc-1.md'), original = await readFile(mdPath, 'utf8');
  await writeFile(mdPath, `${original}\n<script>alert(1)</script>\n`);
  result = await build(); expect(result.exit).not.toBe(0); expect(result.log).toContain('ikke-tilladte elementer');
  expect(await release()).toEqual(valid);
  await writeFile(mdPath, original);

  // 6. Removing the shortcut removes the page from dist.
  drive.files.delete('sc-doc');
  await sync(); await expectGreen();
  expect(await exists('bo-her/leje-af-lokaler/index.html')).toBe(false);
  expect(await html('bo-her/index.html')).toContain('Der er ingen offentliggjorte elementer her endnu.');
}, 90000);
