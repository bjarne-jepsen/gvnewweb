import { afterAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { digest, sealRecord } from '../lib/contracts/content';
import { prepare } from '../lib/publication/store';
import { walk } from '../scripts/verify-output';

const root = await mkdtemp(join(tmpdir(), 'gv-build-'));
afterAll(() => rm(root, { recursive: true, force: true }));
const json = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
const save = (path: string, data: unknown) => writeFile(join(root, path), JSON.stringify(data));
async function build() {
  const proc = Bun.spawn([process.execPath, 'run', 'scripts/build.ts'], { cwd: root, env: { ...process.env, BUILD_AT: '2026-10-20T14:00:00Z' }, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exit, log: stdout + stderr };
}
async function release() {
  const paths = (await walk(join(root, 'dist'))).sort();
  return Promise.all(paths.map(async p => [p.slice(root.length), digest(await readFile(p))]));
}
test('hele buildforløbet: kladde → samme release → ny godkendelse → ny release → fejl bevarer release', async () => {
  for (const path of ['src', 'lib', 'scripts', 'fixtures', 'astro.config.mjs', 'tsconfig.json', 'package.json']) await cp(path, join(root, path), { recursive: true });
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  let result = await build();
  expect(result.log).toContain('Outputkontrol bestået'); expect(result.exit).toBe(0);
  const before = await release();
  const guides = await json('fixtures/candidates/guides.json');
  guides[0] = sealRecord({ ...guides[0], title: 'Ny godkendelseskrævende titel' });
  await save('fixtures/candidates/guides.json', guides);
  const documents = await json('fixtures/candidates/documents.json');
  const doc = documents[0];
  const bytes = Buffer.concat([await readFile(join(root, 'fixtures/assets', doc.file.assetPath)), Buffer.from('\n% changed source\n')]);
  await writeFile(join(root, 'fixtures/assets', doc.file.assetPath), bytes);
  documents[0] = sealRecord({ ...doc, file: { ...doc.file, assetHash: digest(bytes), sizeBytes: bytes.length } });
  await save('fixtures/candidates/documents.json', documents);
  result = await build(); expect(result.exit).toBe(0); expect(await release()).toEqual(before);
  // Preparation and approval are explicit and separate from the ordinary build.
  const manifest = await json('fixtures/manifest.json'); const approvals = await json('fixtures/approvals.json');
  for (const record of [guides[0], documents[0]]) {
    const entry = await prepare(record, join(root, 'fixtures/assets'), join(root, 'fixtures/snapshots'));
    manifest[manifest.findIndex((x: {contentId: string}) => x.contentId === record.id)] = entry;
    approvals.push({ ...entry, decision: 'publish', approvedAt: '2026-10-20T13:00:00Z', approvedBy: 'integration-test' });
  }
  await save('fixtures/manifest.json', manifest); await save('fixtures/approvals.json', approvals);
  result = await build(); expect(result.log).toContain('Outputkontrol bestået'); expect(result.exit).toBe(0);
  expect(await release()).not.toEqual(before);
  expect(await readFile(join(root, 'dist/vejledninger/guide-dokumenter/index.html'), 'utf8')).toContain('Ny godkendelseskrævende titel');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aiv8AAAAASUVORK5CYII=', 'base64');
  await writeFile(join(root, 'fixtures/assets/source/test.png'), png);
  const rich = sealRecord({ ...guides[0], id:'guide-rich', slug:'rich', schemaVersion:2, bodyMarkdown:undefined,
    bodyBlocks:[{type:'table',rows:[[[{type:'paragraph',content:[{text:'Tabelindhold'}]}]]]}, {type:'image',alt:'Testbillede',file:{assetPath:'source/test.png',assetHash:digest(png),sizeBytes:png.length,mimeType:'image/png',originalFilename:'test.png'}}] });
  const richEntry = await prepare(rich, join(root,'fixtures/assets'), join(root,'fixtures/snapshots'));
  guides.push(rich); manifest.push(richEntry); approvals.push({...richEntry,decision:'publish',approvedAt:'2026-10-20T13:00:00Z',approvedBy:'integration-test'});
  await save('fixtures/candidates/guides.json', guides); await save('fixtures/manifest.json',manifest); await save('fixtures/approvals.json',approvals);
  result = await build(); expect(result.log).toContain('Outputkontrol bestået'); expect(result.exit).toBe(0);
  const richHtml = await readFile(join(root,'dist/vejledninger/rich/index.html'),'utf8');
  expect(richHtml).toContain('<table>'); expect(richHtml).toContain('alt="Testbillede"');
  const media = join(root,`dist/media/${digest(png).slice(7)}.png`);
  expect(await readFile(media)).toEqual(png);
  approvals.push({...richEntry,decision:'withdraw',approvedAt:'2026-10-20T13:30:00Z',approvedBy:'integration-test'});
  await save('fixtures/approvals.json',approvals);
  result = await build(); expect(result.exit).toBe(0); expect(await Bun.file(media).exists()).toBe(false);
  const after = await release();
  guides[0].visibility = 'unknown'; await save('fixtures/candidates/guides.json', guides);
  result = await build(); expect(result.exit).not.toBe(0); expect(result.log).toContain('visibility');
  expect(await release()).toEqual(after);
}, 30000);
