import { z } from 'zod';
const text = z.string().transform(s => s.replace(/\r\n?/g, '\n').normalize('NFC'));
const mailto = /^mailto:[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/** The one link rule for parser, Markdown validation, rendering and news: http(s), or a mailto with
 * exactly one address and no parameters (no ?subject/?cc/?bcc/?body). Returns the normalized href. */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (/^mailto:/i.test(v)) { const href = `mailto:${v.slice(7)}`; return mailto.test(href) ? href : undefined; }
  try { const url = new URL(v); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; } catch { return undefined; }
}
const url = z.string().refine(s => safeHref(s) !== undefined, 'Kun http(s)-links og mailto til én adresse er tilladt');
export const assetFields = {
  assetPath: z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/).refine(s => !s.includes('..')),
  assetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), sizeBytes: z.number().int().nonnegative(),
};
export const inlineSchema = z.strictObject({ text, href: url.optional(), bold: z.boolean().optional(), italic: z.boolean().optional() });
const inlines = z.array(inlineSchema);
export const textBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('paragraph'), content: inlines }),
  z.strictObject({ type: z.literal('heading'), level: z.number().int().min(2).max(6), content: inlines }),
  z.strictObject({ type: z.literal('list'), items: z.array(inlines).min(1) }),
]);
const table = z.strictObject({ type: z.literal('table'), rows: z.array(z.array(z.array(textBlockSchema)).min(1).max(20)).min(1).max(200) })
  .refine(t => t.rows.every(row => row.length === t.rows[0]!.length), 'Tabellen skal være rektangulær uden flettede celler');
export const imageFileSchema = z.strictObject({ ...assetFields, mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']), originalFilename: z.string().regex(/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/) });
export const bodyBlockSchema = z.union([textBlockSchema, table, z.strictObject({ type: z.literal('separator') }), z.strictObject({ type: z.literal('image'), file: imageFileSchema, alt: text.pipe(z.string().min(1).max(1500)) })]);
export type Inline = z.infer<typeof inlineSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type BodyBlock = z.infer<typeof bodyBlockSchema>;
export type ImageFile = z.infer<typeof imageFileSchema>;
