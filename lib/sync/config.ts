import { z } from 'zod';
import { driveIdSchema } from './drive';

export const sectionKey = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Pages from Google Docs and news from one sheet. Documents (PDFs) live in ProBo, not on the site.
const section = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('guide'), accepts: z.tuple([z.literal('gdoc')]) }),
  z.strictObject({ type: z.literal('notice'), source: z.literal('sheet') }),
]);
/** Folder name = section key = first URL segment. Lives in Git, never in Drive. */
export const siteConfigSchema = z.strictObject({
  rootFolderId: driveIdSchema,
  sections: z.record(sectionKey, section).refine(s => Object.keys(s).length > 0, 'Mindst én sektion kræves'),
  ignoredFolders: z.array(z.string().min(1)).default([]),
  // External links shown by the site. ProBo holds the association's documents.
  links: z.strictObject({ probo: z.url().refine(u => new URL(u).protocol === 'https:', 'ProBo-linket skal bruge https').optional() }).default({}),
}).superRefine((c, ctx) => {
  for (const name of c.ignoredFolders) if (name in c.sections) ctx.addIssue({ code: 'custom', message: `${name}: både sektion og ignoreret mappe` });
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SectionConfig = SiteConfig['sections'][string];
