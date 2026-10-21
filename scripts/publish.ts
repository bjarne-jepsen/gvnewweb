// One complete run: sync → report → commit of content/ when it changed → build. Never pushes.
// Exit codes: 0 ok, 2 some files failed (content/ and dist updated), 1 aborted or build failed.
import { readFile } from 'node:fs/promises';
import { driveFromEnv } from '../lib/google/env';
import { runOnce } from '../lib/run';
import { siteConfigSchema } from '../lib/sync/config';
import { renderReport } from '../lib/sync/report';

const config = siteConfigSchema.parse(JSON.parse(await readFile('config/site.json', 'utf8')));
const result = await runOnce({ root: '.', config, drive: await driveFromEnv(), commit: !process.argv.includes('--no-commit'), allowMassRemoval: process.argv.includes('--allow-mass-removal') });
if (!result.ok) {
  console.error(`Synkronisering afbrudt: ${result.aborted}\ncontent/ er ikke ændret, og der er ikke bygget.`);
  process.exit(1);
}
console.log(renderReport(result.report));
console.log(result.committed ? 'content/ er committet (ikke pushet).' : 'Intet at committe.');
const build = Bun.spawn([process.execPath, 'run', 'scripts/build.ts'], { stdout: 'inherit', stderr: 'inherit' });
if (await build.exited !== 0) { console.error('Build fejlede; sidste gyldige dist er bevaret.'); process.exit(1); }
process.exitCode = result.report.errors.length ? 2 : 0;
