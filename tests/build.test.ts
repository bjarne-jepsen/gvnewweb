import { afterAll, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../lib/sync/content';
import { siteConfigSchema } from '../lib/sync/config';
import { serializeSlugs, setSlug, slugsSchema } from '../lib/sync/slugs';
import { syncContent } from '../lib/sync/sync';
import { walk } from '../scripts/verify-output';
import { docJson, FakeDrive, png } from './helpers/fake-drive';

const root = await mkdtemp(join(tmpdir(), 'gv-build-'));
afterAll(() => rm(root, { recursive: true, force: true }));
const config = { rootFolderId: 'root' };
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
  for (const [key, name] of [['foreningen', '10 Foreningen'], ['bo-her', '20 Bo her'], ['nyheder', '90 Nyheder'], ['redaktion', 'redaktion']]) drive.folder(`f-${key}`, name!, 'root');
  drive.gdoc('intro', '_intro', 'f-foreningen', docJson('intro', [{ text: 'Bestyrelse og regler.' }, { text: 'Kontakt', style: 'HEADING_2' }, { text: 'Skriv til os.' }]));
  drive.folder('internt', 'Internt', 'elsewhere');
  drive.gdoc('target-doc', 'Lokaleleje_intern_v3', 'internt', docJson('target-doc', [{ text: 'Sådan lejer du lokalerne.' }]));
  drive.shortcut('sc-doc', 'Leje af lokaler', 'f-bo-her', 'target-doc');
  drive.file('a-pdf', 'Vedtægter.pdf', 'f-bo-her', 'application/pdf'); // documents live in ProBo
  drive.images.set('https://lh3.googleusercontent.com/kort', png);
  const doc = (title: string) => docJson('doc-1', [{ text: title, style: 'HEADING_1' }, { text: 'Første afsnit.' }, { text: '', image: 'i1' }], { i1: { uri: 'https://lh3.googleusercontent.com/kort', alt: 'Kort over området' } });
  drive.gdoc('doc-1', 'Om foreningen', 'f-foreningen', doc('Velkommen'));
  drive.gdoc('1Kontakt9xQz', 'Kontakt', 'f-foreningen', docJson('1Kontakt9xQz', [{ text: 'Søgeord: mail, telefon, Mail' }, { text: 'Skriv til foreningen.' }, { text: 'Bestyrelsen', style: 'HEADING_2' }, { text: 'Vi svarer hurtigt.' }]));
  drive.gdoc('private', 'PRIVATE_CANARY', 'internt', canary('private', 'PRIVATE_CANARY'));
  drive.gdoc('red', 'REDAKTION_CANARY', 'f-redaktion', canary('red', 'REDAKTION_CANARY'));
  drive.gdoc('rootfile', 'ROOT_CANARY', 'root', canary('rootfile', 'ROOT_CANARY'));
  const news = (id: string, name: string, date: string, text = 'Tekst', parent = 'f-nyheder', expires?: string) =>
    drive.gdoc(id, name, parent, docJson(id, [{ text: `Dato: ${date}` }, ...(expires ? [{ text: `Vises til: ${expires}` }] : []), { text }]));
  news('nhlive', 'Vandet lukkes', '2026-10-20', 'Mandag kl. 9-12.');
  news('nhold1', 'Ældre nyhed A', '2026-09-01'); news('nhold2', 'Ældre nyhed B', '2026-08-01'); news('nhold3', 'OLDEST_NEWS', '2026-07-01');
  news('nhexpired', 'EXPIRED_CANARY', '2026-01-10', 'Tekst', 'f-nyheder', '2026-01-31');
  news('nhfuture', 'FUTURE_CANARY', '2099-01-01');
  news('nhdraft', 'DRAFT_CANARY', '2026-10-20', 'Tekst', 'internt'); // drafts live outside the section
  await sync();
  // An interrupted dev server left its lock behind (phase 5f): the build takes it over.
  const gone = Bun.spawn(['true']); await gone.exited;
  await mkdir(join(root, '.build'), { recursive: true });
  await writeFile(join(root, '.build/lock'), JSON.stringify({ pid: gone.pid, startedAt: '2026-10-22T16:39:00.000Z' }));
  const first = await expectGreen();
  expect(first.log).toContain(`fjernede .build/lock efterladt af proces ${gone.pid}`);
  expect(await Bun.file(join(root, '.build/lock')).exists()).toBe(false);

  // 0. Front page and footer: existing shortcut targets only, the three latest news, navigation in config order.
  const home = await html('index.html');
  expect(home).toContain('<ul class="shortcuts"><li><a href="/foreningen/kontakt/">Kontakt</a></li></ul>');
  expect(first.log).toContain('Forsiden: "Sælg dit hus" → /bo-her/saelg-dit-hus/ springes over, fordi siden ikke findes');
  expect([...home.matchAll(/href="(\/nyheder\/[^"]+)"/g)].map(m => m[1])).toEqual(['/nyheder/2026-10-20-vandet-lukkes/', '/nyheder/2026-09-01-aeldre-nyhed-a/', '/nyheder/2026-08-01-aeldre-nyhed-b/']);
  expect(home).not.toContain('OLDEST_NEWS');
  // The three latest news as equal rows in one list. The menu covers the sections, so the front page has no section overview.
  expect(home).not.toContain('news-lead');
  expect(home.match(/<ul class="news-list">/g)).toHaveLength(1);
  expect(home.indexOf('id="seneste-nyt"')).toBeLessThan(home.indexOf('id="genveje"'));
  expect(home).toContain('<p class="more"><a href="/nyheder/">Alle nyheder</a></p>');
  expect(home).not.toContain('class="sections"'); expect(home).not.toContain('Find rundt');
  expect(home).toContain('<h1>Velkommen</h1>'); expect(home).not.toContain('Lokal prototype med');
  expect(home).toContain('<p class="intro">Grøndalsvænge er en andelsboligforening med 389 fritliggende huse');
  expect(await html('nyheder/index.html')).toContain('OLDEST_NEWS');
  expect(home).toMatch(/<nav aria-labelledby="sidefod-genveje"><p class="footer-label" id="sidefod-genveje">Genveje<\/p><ul class="footer-links"><li><a href="\/foreningen\/kontakt\/">Kontakt<\/a><\/li><\/ul><\/nav>/);
  // The menu: each page section is a panel with its landing page first and its pages alphabetically; news is a plain link.
  const nav = [...home.matchAll(/<nav aria-label="Hovednavigation" class="site-nav">([\s\S]*?)<\/nav>/g)][0]![1]!;
  expect(nav.match(/href="([^"]+)"/g)).toEqual(['href="/foreningen/"', 'href="/foreningen/kontakt/"', 'href="/foreningen/om-foreningen/"', 'href="/bo-her/"', 'href="/bo-her/leje-af-lokaler/"', 'href="/nyheder/"']);
  expect(nav).toContain('<details class="nav-group" data-nav-group> <summary>Foreningen</summary>');
  expect(nav).toContain('<a class="nav-landing" href="/foreningen/">Gå til Foreningen</a>');
  expect(nav).not.toContain('2026-10-20-vandet-lukkes');
  // Scripts only as external modules from /_astro/; the search box is hidden until its script runs.
  expect([...home.matchAll(/<script\b[^>]*>/g)].map(m => m[0])).toEqual(expect.arrayContaining([expect.stringMatching(/^<script type="module" src="\/_astro\/[^"]+\.js">$/)]));
  expect(home).toContain('<div class="search" data-search hidden>');
  // CVI (docs/cvi.md): the favicon is a data URI, so it adds no output file; header and footer carry the name as text.
  expect(home).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,');
  expect(home).toContain('<a class="brand" href="/" aria-current="page"><span class="brand-name">Andelsboligforeningen</span><span class="brand-sub">Grøndalsvænge</span></a>');
  expect(home).toContain('<p class="footer-name">Grøndalsvænge</p>');
  expect(home).toMatch(/<link rel="stylesheet" href="\/_astro\/[^"]+\.css">/);

  // 1. Pages, unchanged image bytes, nothing from outside the section folders, no PDFs.
  const image = `${digest(png).slice(7, 23)}.png`;
  const shortcutPage = await html('bo-her/leje-af-lokaler/index.html');
  expect(shortcutPage).toContain('<h1>Leje af lokaler</h1>'); expect(shortcutPage).toContain('<p>Sådan lejer du lokalerne.</p>');
  expect((await walk(join(root, 'dist'))).filter(p => /\.pdf$/i.test(p))).toEqual([]);
  const page = await html('foreningen/om-foreningen/index.html');
  expect(page).toContain('<h1>Om foreningen</h1>'); expect(page).toContain('<h2 id="velkommen">Velkommen</h2>');
  expect(page).toContain(`<img src="/foreningen/om-foreningen/${image}" alt="Kort over området"`);
  // CVI 2: content pages have a breadcrumb and end with the update date and a button to the contact page.
  expect(page).toContain('<nav class="crumbs" aria-label="Brødkrumme"> <ol><li><a href="/foreningen/">Foreningen</a></li><li aria-current="page">Om foreningen</li></ol> </nav>');
  expect(page).toMatch(/<p class="meta updated">Opdateret \d+\. \w+ \d{4}<\/p>/);
  expect(page).toContain('<a class="button" href="/foreningen/kontakt/">Kontakt foreningen');
  expect(await html('foreningen/kontakt/index.html')).not.toContain('class="button"');
  // Other sections are landing pages: the title with the intro beside it, and no tiles or list (the menu lists the pages).
  expect(await html('foreningen/index.html')).toContain('<div class="landing-head"> <h1>Foreningen</h1> <div class="landing-intro">');
  expect(await html('foreningen/index.html')).not.toContain('<img');
  expect(await html('foreningen/index.html')).not.toContain('class="entries"');
  // The intro comes from the folder's _intro document: every paragraph on the section page.
  expect(await html('foreningen/index.html')).toContain('<div class="landing-intro"><p class="intro">Bestyrelse og regler.</p></div> </div> <div class="landing-text"><h2 id="kontakt">Kontakt</h2>\n<p>Skriv til os.</p></div>');
  expect(await html('nyheder/index.html')).toContain('<ul class="entries cards"><li>');
  expect(await readFile(dist(`foreningen/om-foreningen/${image}`))).toEqual(png);
  for (const path of await walk(join(root, 'dist'))) expect((await readFile(path)).toString()).not.toMatch(/CANARY|target-doc|doc-1/);
  // The search index: section name, headings, running text and the editor's keywords; the keyword line is not on the page.
  const index = JSON.parse(await html('search.json')) as { title: string; url: string; section: string; headings: string[]; keywords: string[]; text: string; summary: string }[];
  expect(index.find(x => x.url === '/foreningen/kontakt/')).toEqual({ title: 'Kontakt', summary: 'Skriv til foreningen.', url: '/foreningen/kontakt/', section: 'Foreningen',
    headings: ['Bestyrelsen'], keywords: ['mail', 'telefon'], text: 'Skriv til foreningen. Vi svarer hurtigt.' });
  expect(await html('foreningen/kontakt/index.html')).not.toContain('Søgeord');
  expect(index.find(x => x.url === '/nyheder/2026-10-20-vandet-lukkes/')!.section).toBe('Nyheder');
  expect(index.map(x => x.url).sort()).toEqual(['/bo-her/leje-af-lokaler/', '/foreningen/kontakt/', '/foreningen/om-foreningen/',
    '/nyheder/2026-07-01-oldest-news/', '/nyheder/2026-08-01-aeldre-nyhed-b/', '/nyheder/2026-09-01-aeldre-nyhed-a/', '/nyheder/2026-10-20-vandet-lukkes/']);
  // News: expired and future rows are in content/ but not built; drafts never reach content/.
  expect(await html('nyheder/2026-10-20-vandet-lukkes/index.html')).toContain('<time datetime="2026-10-20">20. oktober 2026</time>');
  expect(await html('nyheder/index.html')).toContain('Mandag kl. 9-12.');
  expect(await Bun.file(join(root, 'content/nyheder/nhexpired.json')).exists()).toBe(true);
  expect(await Bun.file(join(root, 'content/nyheder/nhdraft.json')).exists()).toBe(false);

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
  // The same redirects as real 301s for Cloudflare Pages, with and without the trailing slash.
  const rules = await html('_redirects');
  expect(rules).toContain('/andelshaveren/byggeprojekter /foreningen/om-os/ 301\n/andelshaveren/byggeprojekter/ /foreningen/om-os/ 301');
  expect(rules).toContain('/foreningen/om-foreningen/ /foreningen/om-os/ 301');
  expect(rules).not.toContain('/gammel');
  expect(await html('_headers')).toContain('/*\n  X-Robots-Tag: noindex, nofollow');
  expect(await html('sitemap.xml')).toContain('<loc>https://example.invalid/</loc>');

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

  // 6. Removing the shortcut removes the page; a page section without pages leaves the menu.
  drive.files.delete('sc-doc');
  await sync(); await expectGreen();
  expect(await exists('bo-her/leje-af-lokaler/index.html')).toBe(false);
  expect(await exists('bo-her/index.html')).toBe(false);
  expect(await html('index.html')).not.toContain('href="/bo-her/"');
  // 7. A renamed and renumbered folder changes the menu, not the address.
  drive.update('f-foreningen', { name: '95 Om foreningen' });
  await sync(); await expectGreen();
  const menu = [...(await html('index.html')).matchAll(/<nav aria-label="Hovednavigation" class="site-nav">([\s\S]*?)<\/nav>/g)][0]![1]!.replace(/<div class="nav-panel">[\s\S]*?<\/div>/g, '');
  expect([...menu.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)|<summary[^>]*>([^<]+)/g)].map(m => m[3] ? `panel ${m[3]}` : `${m[1]} ${m[2]}`))
    .toEqual(['/nyheder/ Nyheder', 'panel Om foreningen']);
  expect(await html('index.html')).toContain('<a class="nav-landing" href="/foreningen/">Gå til Om foreningen</a>');
  // 8. A _forside document in the root sets the intro and "Det vigtigste": links to pages by document,
  // so the page's changed address is followed; a link to a document outside the sections is left out.
  const link = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
  drive.gdoc('forside', '_forside', 'root', docJson('forside', [{ text: 'Det vigtigste', style: 'HEADING_1' }, { text: 'Vi er 389 huse.' }, { text: 'Kontakt os', bullet: true, href: link('1Kontakt9xQz') },
    { text: 'Om os', bullet: true, href: link('doc-1') }, { text: 'Hemmelig', bullet: true, href: link('private') }]));
  await sync(); const withFront = await expectGreen();
  const front = await html('index.html');
  expect(front).toContain('<p class="intro">Vi er 389 huse.</p>'); expect(front).not.toContain('389 fritliggende');
  expect(front).toContain('<ul class="shortcuts"><li><a href="/foreningen/kontakt/">Kontakt os</a></li><li><a href="/foreningen/om-os/">Om os</a></li></ul>');
  expect(withFront.log).toContain('Forsiden: "Hemmelig" springes over, fordi dokumentet ikke er en side på hjemmesiden');
  for (const path of await walk(join(root, 'dist'))) expect((await readFile(path)).toString()).not.toMatch(/CANARY|Hemmelig|docs\.google\.com|"private"/);
}, 90000);
