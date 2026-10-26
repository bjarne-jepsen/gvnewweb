import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handEditedContent, SYNC_AUTHOR } from '../scripts/check-content-source';

const root = await mkdtemp(join(tmpdir(), 'gv-source-'));
afterAll(() => rm(root, { recursive: true, force: true }));
async function git(...args: string[]) {
  const proc = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (await proc.exited !== 0) throw new Error(`git ${args.join(' ')} fejlede`);
  return (await new Response(proc.stdout).text()).trim();
}
async function commit(path: string, email: string, message: string) {
  await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${message}\n`);
  await git('add', path); await git('-c', 'user.name=x', '-c', `user.email=${email}`, 'commit', '--quiet', '-m', message);
}

test('kun Publicér-workflowet må ændre sider i content/; _slugs.json, _redirects.json og kode må alle', async () => {
  await git('init', '--quiet');
  await commit('README.md', 'dev@example.invalid', 'start');
  const base = await git('rev-parse', 'HEAD');
  await commit('content/bo-her/a.md', SYNC_AUTHOR, 'content: sync');
  await commit('content/_redirects.json', 'dev@example.invalid', 'redirects');
  await commit('content/_slugs.json', 'dev@example.invalid', 'slug');
  await commit('lib/x.ts', 'dev@example.invalid', 'kode');
  expect(await handEditedContent(root, `${base}..HEAD`)).toEqual([]);
  await commit('content/bo-her/a.md', 'dev@example.invalid', 'rettet i hånden');
  expect((await handEditedContent(root, `${base}..HEAD`)).map(c => c.subject)).toEqual(['rettet i hånden']);
});
