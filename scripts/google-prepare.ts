import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GoogleContentAdapter, googlePilotSchema } from '../lib/adapters/google';
import { GoogleReadClient } from '../lib/adapters/google/client';
import { prepare } from '../lib/publication/store';

const configPath = process.argv[2];
if (!configPath) throw new Error('Brug: bun run google:prepare -- .local/google-pilot/config.json');
const config = googlePilotSchema.parse(JSON.parse(await readFile(configPath, 'utf8')));
if ([config.guide.googleFileId, config.document.googleFileId].some(id => id.startsWith('REPLACE_'))) throw new Error('Vælg de to faktiske testfil-IDer i det lokale indeks først');
const token = process.env.GOOGLE_ACCESS_TOKEN ?? (process.env.GOOGLE_ACCESS_TOKEN_FILE ? (await readFile(process.env.GOOGLE_ACCESS_TOKEN_FILE, 'utf8')).trim() : undefined);
if (!token) throw new Error('Mangler Google-adgang: angiv GOOGLE_ACCESS_TOKEN_FILE eller et kortlivet GOOGLE_ACCESS_TOKEN i dit lokale miljø. Indsæt ikke tokens i Git eller chat.');
const base = '.local/google-pilot';
await mkdir(base, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(join(base, 'prepared-'));
try {
  const assets = join(directory, 'assets'), snapshots = join(directory, 'snapshots');
  const records = await new GoogleContentAdapter(config, new GoogleReadClient(token), assets).listCandidates();
  const manifest = [];
  for (const record of records) manifest.push(await prepare(record, assets, snapshots));
  const json = (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await json(join(directory, 'candidates.json'), records);
  await json(join(directory, 'prepared-manifest.json'), manifest);
  const review = ['# Google-pilot — ikke godkendt til publicering', '', 'Dette er de fastfrosne versioner. Gennemgå teksten og PDF-filen før manuel snapshotgodkendelse i Git.', ''];
  for (const record of records) {
    review.push(`## ${record.title}`, '', `ID: ${record.id}`, '', `Hash: ${record.contentHash}`, '', record.summary, '');
    if (record.type === 'guide') review.push(record.bodyMarkdown ?? 'Se review.html for tekst, tabeller og billeder.', '');
    if (record.type === 'document') review.push(`[Åbn den fastholdte PDF](snapshots/${record.id}/${record.contentHash.slice(7)}/document.pdf)`, '');
  }
  await writeFile(join(directory, 'review.md'), review.join('\n'), { mode: 0o600, flag: 'wx' });
  const { writePilotReview } = await import('../lib/publication/pilot-review');
  await writePilotReview(directory, records);
  console.log(`To prepared snapshots er fastholdt i ${resolve(directory)}. Gennemgå review.md og PDF. Ingen godkendelse, manifestopdatering eller publicering er udført.`);
} catch (error) {
  await rm(directory, { recursive: true, force: true });
  throw error;
}
