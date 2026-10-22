import { createHash } from 'node:crypto';
import { z } from 'zod';
import { driveIdSchema } from './drive';

export const digest = (bytes: string | Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** Images are identified by their signature, never by name or claimed MIME type. SVG/HTML are refused. */
export function imageFormat(bytes: Uint8Array): { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; extension: 'png' | 'jpg' | 'webp' } {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: 'image/png', extension: 'png' };
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' };
  throw new Error('Billede skal være PNG, JPEG eller WebP; SVG/HTML understøttes ikke');
}

/** Frontmatter of content/<section>/<driveId>.md; images live in content/<section>/<driveId>/. */
export const guideMetaSchema = z.strictObject({
  id: driveIdSchema, title: z.string().min(1).max(300), updatedAt: z.iso.datetime(), summary: z.string().max(400),
});
export type GuideMeta = z.infer<typeof guideMetaSchema>;
/** content/<section>/<newsId>.json, one file per published row of the news sheet. */
export const newsIdPattern = /^[a-zA-Z0-9_-]{3,64}$/;
export const newsMetaSchema = z.strictObject({
  id: z.string().regex(newsIdPattern), title: z.string().min(1).max(300), date: z.iso.date(), expires: z.iso.date().optional(),
  summary: z.string().max(400), body: z.string().min(1).max(20_000), updatedAt: z.iso.datetime(),
});
export type NewsMeta = z.infer<typeof newsMetaSchema>;
export const newsFingerprint = (m: Omit<NewsMeta, 'updatedAt'>) => digest(JSON.stringify([m.id, m.title, m.date, m.expires ?? null, m.summary, m.body]));
export const serializeNews = (meta: NewsMeta) => JSON.stringify(newsMetaSchema.parse(meta), null, 2) + '\n';
export const imageNamePattern = /^[a-f0-9]{16}\.(png|jpg|webp)$/;
/** Markdown may only reference images in the document's own folder: ./<driveId>/<hash>.<ext> */
export const localImage = (id: string) => (url: string) => url.startsWith(`./${id}/`) && imageNamePattern.test(url.slice(id.length + 3));
export const MAX_IMAGES = 20, MAX_IMAGE_BYTES = 20 * 1024 * 1024;
