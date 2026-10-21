// Reads the website's Drive folders and rewrites content/. Read-only towards Google; never commits.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { GoogleReadClient } from '../lib/google/client';
import { siteConfigSchema } from '../lib/sync/config';
import type { DriveSource } from '../lib/sync/drive';
import { renderReport } from '../lib/sync/report';
import { syncContent } from '../lib/sync/sync';

const config = siteConfigSchema.parse(JSON.parse(await readFile('config/site.json', 'utf8')));
const readToken = async (file: string | undefined) => file ? (await readFile(file, 'utf8')).trim() : undefined;
const token = process.env.GOOGLE_ACCESS_TOKEN ?? await readToken(process.env.GOOGLE_ACCESS_TOKEN_FILE);
if (!token) throw new Error('Mangler Google-adgang: angiv GOOGLE_ACCESS_TOKEN_FILE med et kortlivet token. Læg aldrig tokens i Git eller chat.');
// Optional separate token with documents.readonly; one token with both scopes is enough.
const docsToken = await readToken(process.env.GOOGLE_DOCS_ACCESS_TOKEN_FILE);
const client = new GoogleReadClient(token), docsClient = docsToken ? new GoogleReadClient(docsToken) : client;
const drive: DriveSource = {
  listFolder: id => client.listFolder(id), getFile: id => client.getFile(id), downloadPdf: id => client.downloadPdf(id),
  readDocument: id => docsClient.readDocument(id), downloadImage: uri => client.downloadImage(uri),
};
await mkdir('.sync', { recursive: true });
try {
  const report = await syncContent({ config, drive, contentDir: 'content', allowMassRemoval: process.argv.includes('--allow-mass-removal') });
  await writeFile('.sync/report.json', JSON.stringify(report, null, 2) + '\n');
  await writeFile('.sync/report.md', renderReport(report));
  console.log(renderReport(report));
  // content/ is updated even when single files fail; a non-zero code lets a scheduler flag the report.
  if (report.errors.length) process.exitCode = 2;
} catch (error) {
  const message = `# Synkronisering afbrudt\n\n${error instanceof Error ? error.message : String(error)}\n\ncontent/ er ikke ændret.\n`;
  await writeFile('.sync/report.md', message);
  console.error(message);
  process.exitCode = 1;
}
