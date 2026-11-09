import { z } from 'zod';
import { driveIdSchema } from './drive';

/** First URL segment of a section. */
export const sectionKey = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(90);
export const kindSchema = z.enum(['gdoc', 'notice']);
export type Kind = z.infer<typeof kindSchema>;
/** One section as sync last saw it in Drive. The key (URL) is fixed the first time the folder is
 * seen; label, order, kind and intro follow the folder on every run. */
export const sectionEntrySchema = z.strictObject({
  key: sectionKey, label: z.string().min(1).max(200), order: z.number().int().min(0).max(999), kind: kindSchema, intro: z.string().max(2000),
});
/** content/_sections.json: section folder ID → section. Written by sync only; holds live sections only. */
export const sectionsSchema = z.record(driveIdSchema, sectionEntrySchema).superRefine((s, ctx) => {
  const keys = Object.values(s).map(e => e.key);
  for (const key of new Set(keys)) if (keys.filter(k => k === key).length > 1) ctx.addIssue({ code: 'custom', message: `Adressen /${key}/ bruges af flere sektioner` });
});
export type SectionEntry = z.infer<typeof sectionEntrySchema>;
export type Sections = z.infer<typeof sectionsSchema>;
export const serializeSections = (sections: Sections) =>
  JSON.stringify(Object.fromEntries(Object.entries(sectionsSchema.parse(sections)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), null, 2) + '\n';

/** "20 Bo her" → order 20, label "Bo her". One to three digits, an optional "." or ")", then a space.
 * Four digits are left out on purpose, so a folder like "2024 Generalforsamling" never goes public. */
export function parseSectionName(name: string): { order: number; label: string } | undefined {
  const match = /^(\d{1,3})[.)]?\s+(\S.*)$/.exec(name.normalize('NFC').trim());
  return match ? { order: Number(match[1]), label: match[2]!.trim().replace(/\s+/g, ' ') } : undefined;
}

// Manual redirects, e.g. from old WordPress URLs. Directory-style paths only.
const redirectPath = z.string().regex(/^\/(?:[a-zA-Z0-9._~-]+\/)+$/).refine(p => !p.split('/').some(s => s === '.' || s === '..'));
export const manualRedirectsSchema = z.record(redirectPath, redirectPath);
