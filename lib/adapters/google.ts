import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { canonical, digest, normalizeRecord, sealRecord, validateSet } from '../contracts/content';
import { verifyAsset } from '../publication/store';
import { imageFormat, verifyFile, type Asset } from '../publication/assets';
import { googleDocsBlocks } from './google/blocks';
import type { ContentAdapter } from './content-adapter';
import { googleIdSchema, type GoogleReader } from './google/client';
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const common = { id, slug: id, summary: z.string(), category: z.enum(['Foreningen', 'Bolig og vedligehold', 'Fællesskab']), visibility: z.literal('public'), googleFileId: googleIdSchema };
export const googlePilotSchema = z.strictObject({
  guide: z.strictObject({ ...common, imageAltText: z.record(z.string(), z.string().min(1).max(1500)).optional() }),
  document: z.strictObject({ ...common, title: z.string().min(1), documentKind: z.enum(['vejledning', 'referat', 'regnskab', 'vedtægter']), originalFilename: z.string().regex(/^[a-zA-Z0-9_-]+\.pdf$/) }),
}).superRefine((c, ctx) => {
  if (c.guide.id === c.document.id || c.guide.googleFileId === c.document.googleFileId) ctx.addIssue({ code: 'custom', message: 'Piloten kræver to særskilte indholds-IDer og Google-filer' });
});
export type GooglePilotConfig = z.infer<typeof googlePilotSchema>;
interface SourceVersion { modifiedTime: string; sourceRevision?: string; }
/** The shared normalization boundary used by REST reads and authenticated connector captures.
 * Source consistency must be checked by the caller before materializing any outputs. */
export async function normalizeGoogleSources(config: GooglePilotConfig, docJson: unknown, pdf: Uint8Array, guideSource: SourceVersion, pdfSource: SourceVersion, readImage: (uri: string) => Promise<Uint8Array>) {
  const { guide: g, document: d } = config;
  const assets: { file: Asset; bytes: Uint8Array }[] = [];
  const body = await googleDocsBlocks(docJson, g.googleFileId, async (id, embedded) => {
    const alt = g.imageAltText?.[id] ?? embedded.description ?? embedded.title;
    if (typeof alt !== 'string' || !alt.trim()) throw new Error('Google Docs: billedet mangler alternativ tekst; angiv den i pilotindekset');
    const props = z.record(z.string(), z.unknown()).parse(embedded.imageProperties);
    const data = await readImage(z.string().parse(props.contentUri));
    if (assets.length >= 20 || assets.reduce((sum, image) => sum + image.bytes.length, 0) + data.length > 20 * 1024 * 1024) throw new Error('Google Docs: for mange eller for store billeder');
    const format = imageFormat(data), hash = digest(data);
    const file = { assetPath: `source/${hash.slice(7)}.${format.extension}`, assetHash: hash, sizeBytes: data.length, mimeType: format.mimeType, originalFilename: `${hash.slice(7)}.${format.extension}` };
    assets.push({ file, bytes: data }); return { type: 'image', file, alt };
  });
  const hash = digest(pdf);
  const document = sealRecord({ schemaVersion: 1, id: d.id, type: 'document', title: d.title, slug: d.slug, summary: d.summary, category: d.category, visibility: d.visibility, updatedAt: pdfSource.modifiedTime,
    source: { provider: 'google', sourceId: d.googleFileId, sourceRevision: pdfSource.sourceRevision }, documentKind: d.documentKind,
    file: { assetPath: `source/${hash.slice(7)}.pdf`, assetHash: hash, sizeBytes: pdf.byteLength, mimeType: 'application/pdf', originalFilename: d.originalFilename } });
  const guide = sealRecord({ schemaVersion: 2, id: g.id, type: 'guide', ...body, slug: g.slug, summary: g.summary, category: g.category, visibility: g.visibility, updatedAt: guideSource.modifiedTime,
    source: { provider: 'google', sourceId: g.googleFileId, sourceRevision: guideSource.sourceRevision }, relatedDocumentIds: [d.id] });
  verifyAsset(document, pdf);
  if (document.type !== 'document') throw new Error('Google: intern kontraktfejl');
  assets.unshift({ file: document.file, bytes: pdf });
  return { records: validateSet([document, guide].map(normalizeRecord)), assets };
}
export async function materializeGoogleAssets(assetRoot: string, assets: {file: Asset; bytes: Uint8Array}[]) {
  await mkdir(join(assetRoot, 'source'), { recursive: true });
  for (const asset of assets) {
    const path = join(assetRoot, asset.file.assetPath);
    verifyFile(asset.file, asset.bytes);
    try { await writeFile(path, asset.bytes, { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      verifyFile(asset.file, await readFile(path));
    }
  }
}
export class GoogleContentAdapter implements ContentAdapter {
  private config: GooglePilotConfig;
  constructor(input: unknown, private client: GoogleReader, private assetRoot: string) { this.config = googlePilotSchema.parse(input); }
  async listCandidates() {
    const { guide: g, document: d } = this.config;
    const beforeG = await this.client.metadata(g.googleFileId), beforeD = await this.client.metadata(d.googleFileId);
    for (const [meta, id, mime] of [[beforeG, g.googleFileId, 'application/vnd.google-apps.document'], [beforeD, d.googleFileId, 'application/pdf']] as const) {
      if (meta.id !== id || meta.trashed || meta.mimeType !== mime) throw new Error('Google: kilde-ID, type eller papirkurvstatus matcher ikke pilotindekset');
    }
    const doc = await this.client.document(g.googleFileId), pdf = await this.client.pdf(d.googleFileId);
    if (beforeD.size === undefined || BigInt(beforeD.size) !== BigInt(pdf.byteLength)) throw new Error('Google: PDF-størrelse matcher ikke Drive-metadata');
    if (beforeD.sha256Checksum && digest(pdf) !== `sha256:${beforeD.sha256Checksum}`) throw new Error('Google: PDF matcher ikke Drive-checksum');
    const normalized = await normalizeGoogleSources(this.config, doc, pdf, { modifiedTime: beforeG.modifiedTime, sourceRevision: beforeG.version }, { modifiedTime: beforeD.modifiedTime, sourceRevision: beforeD.version }, uri => this.client.image(uri));
    const afterG = await this.client.metadata(g.googleFileId), afterD = await this.client.metadata(d.googleFileId);
    if (canonical(beforeG) !== canonical(afterG) || canonical(beforeD) !== canonical(afterD)) throw new Error('Google: kilde ændret under hentning; hent og klargør igen');
    await materializeGoogleAssets(this.assetRoot, normalized.assets);
    return normalized.records;
  }
}
