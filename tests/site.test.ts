import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSite } from '../lib/site/load';
import { renderBody } from '../lib/site/render';
import { siteConfigSchema } from '../lib/sync/config';
import { syncContent } from '../lib/sync/sync';
import { docJson, FakeDrive } from './helpers/fake-drive';

const local = (url: string) => url.startsWith('./d/');
test('renderer escaper tekst og attributter og kender kun dialekten', () => {
  const html = renderBody('## A \\&amp; \\<b\\>\n\n[l](https://example.test/?a=1&b="x") **f** *k*\\\nny\n\n- et\n- to\n\n---\n\n| h1 | h2 |\n| --- | --- |\n| c1 | c2 |\n\n![Alt "x"](./d/abcdef0123456789.png)\n', local, u => `/s/p/${u.slice(4)}`);
  expect(html).toContain('<h2>A &amp;amp; &lt;b&gt;</h2>');
  expect(html).toContain('<a href="https://example.test/?a=1&amp;b=%22x%22" rel="noreferrer">l</a> <strong>f</strong> <em>k</em><br>');
  expect(html).toContain('<ul><li>et</li><li>to</li></ul>');
  expect(html).toContain('<thead><tr><th>h1</th><th>h2</th></tr></thead><tbody><tr><td>c1</td><td>c2</td></tr></tbody>');
  expect(html).toContain('<figure><img src="/s/p/abcdef0123456789.png" alt="Alt &quot;x&quot;"');
  expect(() => renderBody('<b>x</b>\n', local, u => u)).toThrow('ikke-tilladte');
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function site(sections: Record<string, unknown> = { foreningen: { type: 'guide', category: 'f', accepts: ['gdoc'] } }) {
  const root = await mkdtemp(join(tmpdir(), 'gv-site-')); roots.push(root);
  const config = { rootFolderId: 'root', sections };
  await mkdir(join(root, 'config')); await writeFile(join(root, 'config/site.json'), JSON.stringify(config));
  const drive = new FakeDrive();
  for (const name of Object.keys(sections)) drive.folder(`f-${name}`, name, 'root');
  drive.gdoc('doc-a', 'Om foreningen', 'f-foreningen', docJson('doc-a', [{ text: 'Tekst.' }]));
  drive.gdoc('doc-b', 'Bestyrelsen', 'f-foreningen', docJson('doc-b', [{ text: 'Mere.' }]));
  await syncContent({ config: siteConfigSchema.parse(config), drive, contentDir: join(root, 'content') });
  return root;
}
test('loadSite giver sorterede sider, stier og interne ID\'er kun til kontrol', async () => {
  const s = await loadSite(await site());
  expect(s.items.map(i => [i.title, i.path])).toEqual([['Bestyrelsen', '/foreningen/bestyrelsen/'], ['Om foreningen', '/foreningen/om-foreningen/']]);
  expect(s.sections).toEqual([{ key: 'foreningen', order: 0, label: 'Foreningen', intro: 'Om andelsboligforeningen, og hvordan den drives.', path: '/foreningen/' }]);
  expect(s.internalIds.sort()).toEqual(['doc-a', 'doc-b']);
});
test('loadSite afviser manglende slug, redirect over en side og sektion uden navigation', async () => {
  const root = await site();
  const slugsPath = join(root, 'content/_slugs.json'), slugs = JSON.parse(await readFile(slugsPath, 'utf8'));
  await writeFile(slugsPath, JSON.stringify({ ...slugs, 'doc-a': { ...slugs['doc-a'], previousPaths: ['/foreningen/bestyrelsen/'] } }));
  await rejects(loadSite(root), /rammer en eksisterende side/);
  const { ['doc-a']: _gone, ...rest } = slugs;
  await writeFile(slugsPath, JSON.stringify(rest));
  await rejects(loadSite(root), /doc-a mangler/);
  await rejects(loadSite(await site({ foreningen: { type: 'guide', category: 'f', accepts: ['gdoc'] }, arkiv: { type: 'document', accepts: ['pdf'] } })), /arkiv mangler tekst/);
});
