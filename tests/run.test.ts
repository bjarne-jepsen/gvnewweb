import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOnce } from '../lib/run';
import { siteConfigSchema } from '../lib/sync/config';
import { commitMessage, emptyReport } from '../lib/sync/report';
import { FakeDrive, pdfBytes } from './helpers/fake-drive';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function git(root: string, ...args: string[]) {
  const proc = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args.join(' ')} fejlede`);
  return out;
}
async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'gv-run-')); roots.push(root);
  await git(root, 'init', '--quiet'); await git(root, 'config', 'user.name', 'Test'); await git(root, 'config', 'user.email', 'test@example.invalid');
  await writeFile(join(root, 'README.md'), 'start\n'); await writeFile(join(root, '.gitignore'), '.sync/\n'); await git(root, 'add', 'README.md', '.gitignore'); await git(root, 'commit', '--quiet', '-m', 'start');
  const drive = new FakeDrive();
  drive.folder('f-dokumenter', 'dokumenter', 'root');
  const config = siteConfigSchema.parse({ rootFolderId: 'root', sections: { dokumenter: { type: 'document', accepts: ['pdf'] } } });
  const run = (commit = true) => runOnce({ root, config, drive, commit, now: new Date('2026-10-21T20:00:00Z') });
  const log = async () => (await git(root, 'log', '--format=%s')).trim().split('\n');
  return { root, drive, run, log };
}

test('ændringer giver ét commit med kun content/ og en beskrivende besked; uændret kørsel giver intet', async () => {
  const r = await repo();
  r.drive.pdf('doc-a', 'Vedtægter.pdf', 'f-dokumenter'); r.drive.pdf('doc-b', 'Husorden.pdf', 'f-dokumenter');
  // Unrelated work in progress, one file staged and one not, must stay out of the commit.
  await writeFile(join(r.root, 'README.md'), 'lokal ændring\n'); await writeFile(join(r.root, 'noter.txt'), 'staged\n'); await git(r.root, 'add', 'noter.txt');
  expect((await r.run()).committed).toBe(true);
  expect(await r.log()).toEqual(['content: synkronisering 2026-10-21 (2 nye, 0 ændrede, 0 fjernede)', 'start']);
  expect((await git(r.root, 'show', '--name-only', '--format=', 'HEAD')).trim().split('\n').sort()).toEqual(['content/_slugs.json', 'content/dokumenter/doc-a.json', 'content/dokumenter/doc-a.pdf', 'content/dokumenter/doc-b.json', 'content/dokumenter/doc-b.pdf']);
  expect(await git(r.root, 'show', '--format=%B', '--no-patch', 'HEAD')).toContain('Nye:\n- dokumenter: Vedtægter\n- dokumenter: Husorden'); // stable order: by ID
  expect((await git(r.root, 'status', '--porcelain')).split('\n').filter(Boolean).sort()).toEqual([' M README.md', 'A  noter.txt']);
  expect((await r.run()).committed).toBe(false);
  expect(await r.log()).toHaveLength(2);
  expect(await readFile(join(r.root, '.sync/report.md'), 'utf8')).toContain('0 nye, 0 ændrede, 0 fjernede, 2 uændrede');
  r.drive.files.delete('doc-b');
  expect((await r.run()).committed).toBe(true);
  expect((await r.log())[0]).toBe('content: synkronisering 2026-10-21 (0 nye, 0 ændrede, 1 fjernede)');
});

test('afbrudt sync giver hverken commit eller ændringer; rapporten forklarer hvorfor', async () => {
  const r = await repo();
  r.drive.failList.add('root');
  const result = await r.run();
  expect(result).toEqual({ ok: false, aborted: 'Google: HTTP 500', committed: false });
  expect(await r.log()).toEqual(['start']);
  expect(await readFile(join(r.root, '.sync/report.md'), 'utf8')).toBe('# Synkronisering afbrudt\n\nGoogle: HTTP 500\n\ncontent/ er ikke ændret.\n');
});

test('fejl i enkelte filer committes stadig; --no-commit committer intet', async () => {
  const r = await repo();
  r.drive.pdf('doc-a', 'A.pdf', 'f-dokumenter'); r.drive.pdf('bad', 'Ødelagt.pdf', 'f-dokumenter', Buffer.from('ikke en pdf'));
  const result = await r.run();
  expect(result.committed).toBe(true); expect(result.ok && result.report.errors).toHaveLength(1);
  expect(await git(r.root, 'show', '--format=%B', '--no-patch', 'HEAD')).toContain('1 fejl og 0 advarsler');
  r.drive.pdf('doc-c', 'C.pdf', 'f-dokumenter', pdfBytes('c'));
  expect((await r.run(false)).committed).toBe(false);
  expect(await r.log()).toHaveLength(2);
  expect(await git(r.root, 'status', '--porcelain', '--', 'content')).toContain('content/');
});

test('commit-beskeden samler linjeskift i titler', () => {
  const report = { ...emptyReport('2026-10-21T20:00:00.000Z'), changed: [{ section: 'nyheder', id: 'n-1', title: 'To\nlinjer' }] };
  expect(commitMessage(report)).toBe('content: synkronisering 2026-10-21 (0 nye, 1 ændrede, 0 fjernede)\n\nÆndrede:\n- nyheder: To linjer\n');
});
