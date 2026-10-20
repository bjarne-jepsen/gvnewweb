/** Reproducible normalization of authenticated, locally captured connector data.
 * This is not a new API request and does not stand in for the REST version checks. */
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { googlePilotSchema, normalizeGoogleSources } from '../lib/adapters/google';
import { digest } from '../lib/contracts/content';
import { safeRead } from '../lib/publication/store';
import { preparePilot } from '../lib/publication/prepare-pilot';

const [configPath, capturePath] = process.argv.slice(2);
if (!configPath || !capturePath) throw new Error('Brug: bun run google:prepare-capture -- <lokalt indeks.json> <lokal capture.json>');
const config = googlePilotSchema.parse(JSON.parse(await readFile(configPath, 'utf8')));
const capture = z.strictObject({ documentFile: z.string(), pdfFile: z.string(), revisionCheckFile: z.string(), pdfCheckFile: z.string(), imageFiles: z.record(z.string(), z.string()) }).parse(JSON.parse(await readFile(capturePath, 'utf8')));
const base = dirname(capturePath);
const json = async (path: string) => JSON.parse((await safeRead(base, path)).toString());
const doc = await json(capture.documentFile), revision = await json(capture.revisionCheckFile), pdfCheck = await json(capture.pdfCheckFile);
const bytes = await safeRead(base, capture.pdfFile);
if (revision.documentId !== config.guide.googleFileId || doc.documentId !== config.guide.googleFileId || !revision.revisionBefore || revision.revisionBefore !== revision.revisionAfter || doc.revisionId !== revision.revisionBefore) throw new Error('Capture: Google Docs-revision er ikke verificeret');
if (pdfCheck.fileId !== config.document.googleFileId || pdfCheck.sha256Before !== pdfCheck.sha256After || `sha256:${pdfCheck.sha256Before}` !== digest(bytes) || pdfCheck.sizeBytes !== bytes.length || pdfCheck.modifiedTimeBefore !== pdfCheck.modifiedTimeAfter) throw new Error('Capture: PDF-bytes er ikke verificeret');
// The connector returns flattened tabs rather than the REST API's documentTab wrapper.
const tabs = z.array(z.record(z.string(), z.unknown())).parse(doc.tabs);
const resource = { ...doc, tabs: tabs.map(tab => ({ tabProperties: { tabId: tab.tabId }, childTabs: tab.parentTabId ? [{}] : [], documentTab: tab })) };
const normalized = await normalizeGoogleSources(config, resource, bytes,
  { modifiedTime: z.iso.datetime({ offset: true }).parse(revision.modifiedTime), sourceRevision: revision.revisionBefore },
  { modifiedTime: z.iso.datetime({ offset: true }).parse(pdfCheck.modifiedTimeBefore), sourceRevision: `captured:${digest(bytes)}` },
  async uri => {
    const image = Object.entries(capture.imageFiles).find(([id]) => tabs.some(tab => {
      const objects = tab.inlineObjects as Record<string, {inlineObjectProperties?: {embeddedObject?: {imageProperties?: {contentUri?: string}}}}> | undefined;
      return objects?.[id]?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri === uri;
    }));
    if (!image) throw new Error('Capture: billedfil mangler');
    return safeRead(base, image[1]);
  });
const directory = await preparePilot(normalized.records, normalized.assets);
console.log(`Prepared fra autentificeret connector-capture: ${directory}/review.html`);
console.log('Ingen godkendelse eller publicering udført. Selvstændig REST-kørsel kræver særskilt lokalt token.');
