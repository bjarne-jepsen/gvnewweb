import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { recordAssets, verifyFile } from './assets';
import { hashSchema, normalizeRecord, publicationPayload, validateSet, type ContentRecord } from '../contracts/content';

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const timestamp = z.iso.datetime({ offset: true });
export const approvalSchema = z.strictObject({
  contentId: idSchema, approvedHash: hashSchema,
  approvedAt: timestamp, approvedBy: z.string().min(1), decision: z.enum(['publish', 'withdraw']),
});
export type Approval = z.infer<typeof approvalSchema>;
export const manifestSchema = z.array(z.strictObject({ contentId: idSchema, approvedHash: hashSchema }));
export type Manifest = z.infer<typeof manifestSchema>;
export const snapshotDirectory = (root: string, id: string, hash: string) => {
  idSchema.parse(id); hashSchema.parse(hash);
  return join(root, id, hash.slice(7));
};
export async function safeRead(root: string, path: string) {
  const base = await realpath(root), target = await realpath(resolve(base, path));
  const rel = relative(base, target);
  if (rel.startsWith('..') || rel === '') throw new Error('Assetsti forlader sin private rod');
  return readFile(target);
}
export function verifyAsset(record: ContentRecord, bytes: Uint8Array) {
  if (record.type !== 'document') throw new Error('Forventede document');
  try { verifyFile(record.file, bytes); } catch (error) { throw new Error(`${record.id}: ${String(error)}`); }
}
export async function prepare(input: ContentRecord, assetRoot: string, snapshotRoot: string) {
  const record = normalizeRecord(input);
  const directory = snapshotDirectory(snapshotRoot, record.id, record.contentHash);
  const files = [];
  for (const asset of recordAssets(record)) {
    const bytes = await safeRead(assetRoot, asset.file.assetPath);
    verifyFile(asset.file, bytes); files.push({ ...asset, bytes });
  }
  await mkdir(directory, { recursive: true });
  // Exclusive creation: an existing version and all its assets are verified, never overwritten.
  for (const asset of files) {
    const target = join(directory, asset.snapshotPath);
    await mkdir(resolve(target, '..'), { recursive: true });
    try { await writeFile(target, asset.bytes, { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      verifyFile(asset.file, await safeRead(directory, asset.snapshotPath));
    }
  }
  try { await writeFile(join(directory, 'record.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = normalizeRecord(JSON.parse(await readFile(join(directory, 'record.json'), 'utf8')));
    if (existing.id !== record.id || existing.contentHash !== record.contentHash) throw new Error(`${record.id}: snapshotkonflikt`);
  }
  return { contentId: record.id, approvedHash: record.contentHash };
}
export function resolveManifest(input: unknown, approvalInput: unknown, buildAt: string): Manifest {
  const manifest = manifestSchema.parse(input), approvals = z.array(approvalSchema).parse(approvalInput);
  const now = Date.parse(timestamp.parse(buildAt));
  if (new Set(manifest.map(x => x.contentId)).size !== manifest.length) throw new Error('Dubleret ID i manifest');
  const latest = new Map<string, Approval>();
  const decisions = new Set<string>();
  for (const a of approvals) {
    const prior = latest.get(a.contentId);
    const decisionKey = `${a.contentId}:${Date.parse(a.approvedAt)}`;
    if (decisions.has(decisionKey)) throw new Error(`${a.contentId}: tvetydige beslutninger`);
    decisions.add(decisionKey);
    if (Date.parse(a.approvedAt) > now) throw new Error(`${a.contentId}: godkendelse ligger efter buildAt`);
    if (!prior || Date.parse(a.approvedAt) > Date.parse(prior.approvedAt)) latest.set(a.contentId, a);
  }
  return manifest.filter(entry => {
    const a = latest.get(entry.contentId);
    if (a?.decision === 'withdraw') return false;
    if (!a || a.approvedHash !== entry.approvedHash) throw new Error(`${entry.contentId}: manifest mangler præcis godkendelse`);
    return true;
  });
}
export async function selectPublic(manifestInput: unknown, approvals: unknown, snapshotRoot: string, buildAt: string) {
  const manifest = resolveManifest(manifestInput, approvals, buildAt);
  const records: ContentRecord[] = [];
  const assets = new Map<string, Uint8Array>();
  for (const entry of manifest) {
    const directory = snapshotDirectory(snapshotRoot, entry.contentId, entry.approvedHash);
    const record = normalizeRecord(JSON.parse((await safeRead(directory, 'record.json')).toString()));
    if (record.id !== entry.contentId || record.contentHash !== entry.approvedHash) throw new Error(`${entry.contentId}: forkert snapshot`);
    if (record.visibility !== 'public') throw new Error(`${record.id}: godkendt snapshot er ikke public`);
    for (const asset of recordAssets(record)) {
      const bytes = await safeRead(directory, asset.snapshotPath); verifyFile(asset.file, bytes);
      assets.set(asset.publicUrl, bytes);
    }
    if (record.type === 'notice' && ((record.publishFrom && Date.parse(record.publishFrom) > Date.parse(buildAt)) || (record.expiresAt && Date.parse(record.expiresAt) <= Date.parse(buildAt)))) continue;
    records.push(record);
  }
  validateSet(records);
  return { records: records.map(publicationPayload), assets };
}
export const assetUrl = (r: Extract<ContentRecord, { type: 'document' }>) => `/downloads/${r.file.assetHash.slice(7)}.pdf`;
export type PublicRecord = ReturnType<typeof publicationPayload>;
export const recordUrl = (r: Pick<ContentRecord, 'type' | 'slug'>) => `/${({ document: 'dokumenter', guide: 'vejledninger', notice: 'opslag', event: 'kalender' } as const)[r.type]}/${r.slug}/`;
