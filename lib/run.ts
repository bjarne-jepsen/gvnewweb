import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commitMessage, hasChanges, renderReport, type SyncReport } from './sync/report';
import { syncContent, type SyncOptions } from './sync/sync';

export interface RunOptions extends Omit<SyncOptions, 'contentDir'> { root: string; commit: boolean }
export type RunResult = { ok: false; aborted: string; committed: false } | { ok: true; report: SyncReport; committed: boolean };

async function git(root: string, args: string[], stdin?: string) {
  const proc = Bun.spawn(['git', ...args], { cwd: root, stdin: stdin === undefined ? 'ignore' : new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args[0]} fejlede: ${err.trim() || out.trim()}`);
  return out;
}

/** One run: sync → report in .sync/ → commit of content/ only, and only when something changed.
 * Never pushes. Other changes in the working tree, staged or not, are left alone. */
export async function runOnce(o: RunOptions): Promise<RunResult> {
  const work = join(o.root, '.sync');
  await mkdir(work, { recursive: true });
  let report: SyncReport;
  try { report = await syncContent({ ...o, contentDir: join(o.root, 'content') }); }
  catch (error) {
    const aborted = error instanceof Error ? error.message : String(error);
    await writeFile(join(work, 'report.md'), `# Synkronisering afbrudt\n\n${aborted}\n\ncontent/ er ikke ændret.\n`);
    await writeFile(join(work, 'report.json'), JSON.stringify({ aborted }, null, 2) + '\n');
    return { ok: false, aborted, committed: false };
  }
  await writeFile(join(work, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(work, 'report.md'), renderReport(report));
  if (!o.commit || !hasChanges(report)) return { ok: true, report, committed: false };
  await git(o.root, ['add', '--all', '--', 'content']);
  // A pathspec commit takes only content/; anything else that is staged stays staged.
  if (!(await git(o.root, ['status', '--porcelain', '--', 'content'])).trim()) return { ok: true, report, committed: false };
  await git(o.root, ['commit', '--quiet', '--file=-', '--', 'content'], commitMessage(report));
  return { ok: true, report, committed: true };
}
