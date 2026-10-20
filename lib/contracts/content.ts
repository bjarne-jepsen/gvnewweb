import { createHash } from 'node:crypto';
import { z } from 'zod';

export const digest = (bytes: string | Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().transform(s => s.replace(/\r\n?/g, '\n').normalize('NFC'));
const dateTime = z.iso.datetime({ offset: true }).transform(s => new Date(s).toISOString());
const safeUrl = z.url().refine(s => ['https:', 'http:'].includes(new URL(s).protocol), 'Kun http/https-links er tilladt');
const markdown = text.refine(s => !/[<>]/.test(s) && !/!\[/.test(s) && !/\|/.test(s) && !/```/.test(s), 'HTML, billeder, tabeller og kodeblokke understøttes ikke i POC')
  .refine(s => !/\[[^\]]*\]\((?!https?:\/\/)[^)]*\)/i.test(s), 'Markdown-links skal bruge http/https')
  .refine(s => !/^\s*\[[^\]]+\]:/m.test(s), 'Referencelinks understøttes ikke');
const common = {
  schemaVersion: z.literal(1), id: identifier, title: text.pipe(z.string().min(1)), summary: text,
  slug: identifier, category: z.enum(['Foreningen', 'Bolig og vedligehold', 'Fællesskab']),
  visibility: z.enum(['public', 'members', 'board']), updatedAt: dateTime,
  source: z.strictObject({ provider: z.enum(['mock', 'google']), sourceId: z.string().min(1), sourceRevision: z.string().optional() }),
  contentHash: hashSchema,
};
const recordUnion = z.discriminatedUnion('type', [
  z.strictObject({ ...common, type: z.literal('document'), documentKind: z.enum(['vejledning', 'referat', 'regnskab', 'vedtægter']), effectiveDate: z.iso.date().optional(),
    file: z.strictObject({ assetPath: z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/).refine(s => !s.includes('..')), assetHash: hashSchema, sizeBytes: z.number().int().nonnegative(), mimeType: z.literal('application/pdf'), originalFilename: z.string().regex(/^[a-zA-Z0-9_-]+\.pdf$/) }) }),
  z.strictObject({ ...common, type: z.literal('guide'), bodyMarkdown: markdown, relatedDocumentIds: z.array(identifier), ownerLabel: text.optional() }),
  z.strictObject({ ...common, type: z.literal('notice'), bodyMarkdown: markdown, publishFrom: dateTime.optional(), expiresAt: dateTime.optional(), priority: z.enum(['normal', 'important']) }),
  z.strictObject({ ...common, type: z.literal('event'), startsAt: dateTime, endsAt: dateTime, timeZone: z.literal('Europe/Copenhagen'), locationText: text.optional(), registrationUrl: safeUrl.optional() }),
]);
export const contentSchema = recordUnion.superRefine((r, ctx) => {
  if (r.type === 'event' && r.endsAt <= r.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Skal ligge efter startsAt' });
  if (r.type === 'notice' && r.publishFrom && r.expiresAt && r.expiresAt <= r.publishFrom) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Skal ligge efter publishFrom' });
});
export type ContentRecord = z.infer<typeof contentSchema>;
export function publicationPayload(record: ContentRecord) {
  const { source: _source, contentHash: _hash, ...payload } = record;
  if (payload.type === 'document') {
    const { assetPath: _path, ...file } = payload.file;
    return { ...payload, file };
  }
  return payload;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const contentHash = (r: ContentRecord) => digest(canonical(publicationPayload(r)));
export function normalizeRecord(input: unknown): ContentRecord {
  const raw = input as Record<string, unknown>;
  // Fixtures have the same full record shape; supplied hashes are verified, never trusted.
  const r = contentSchema.parse(raw);
  if (contentHash(r) !== r.contentHash) throw new Error(`${r.id}: contentHash matcher ikke payload`);
  return r;
}
export function sealRecord(input: unknown): ContentRecord {
  const r = contentSchema.parse({ ...(input as object), contentHash: `sha256:${'0'.repeat(64)}` });
  return { ...r, contentHash: contentHash(r) };
}
export function validateSet(records: ContentRecord[]) {
  const ids = new Set<string>(), urls = new Set<string>();
  for (const r of records) {
    const url = `${r.type}/${r.slug}`;
    if (ids.has(r.id) || urls.has(url)) throw new Error(`${r.id}: dubleret ID eller URL`);
    ids.add(r.id); urls.add(url);
  }
  for (const r of records) if (r.type === 'guide') for (const id of r.relatedDocumentIds) {
    if (!records.some(x => x.id === id && x.type === 'document')) throw new Error(`${r.id}.relatedDocumentIds: dokument ${id} mangler`);
  }
  return records;
}
