// Reads the website's Drive folders and rewrites content/. Read-only towards Google; never commits.
// Exit codes: 0 ok, 2 some files failed (content/ updated), 1 aborted (content/ unchanged).
import { readFile } from 'node:fs/promises';
import { driveFromEnv } from '../lib/google/env';
import { runOnce } from '../lib/run';
import { siteConfigSchema } from '../lib/sync/config';
import { renderReport } from '../lib/sync/report';

const config = siteConfigSchema.parse(JSON.parse(await readFile('config/site.json', 'utf8')));
const result = await runOnce({ root: '.', config, drive: await driveFromEnv(), commit: false, allowMassRemoval: process.argv.includes('--allow-mass-removal') });
if (!result.ok) {
  console.error(`# Synkronisering afbrudt\n\n${result.aborted}\n\ncontent/ er ikke ændret.`);
  process.exitCode = 1;
} else {
  console.log(renderReport(result.report));
  if (result.report.errors.length) process.exitCode = 2;
}
