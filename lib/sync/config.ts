import { z } from 'zod';
import { driveIdSchema } from './drive';

export const sectionKey = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const section = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('guide'), category: z.string().min(1), accepts: z.tuple([z.literal('gdoc')]) }),
  z.strictObject({ type: z.literal('document'), accepts: z.tuple([z.literal('pdf')]) }),
  z.strictObject({ type: z.literal('notice'), source: z.literal('sheet') }),
]);
/** Folder name = section key = first URL segment. Lives in Git, never in Drive. */
export const siteConfigSchema = z.strictObject({
  rootFolderId: driveIdSchema,
  sections: z.record(sectionKey, section).refine(s => Object.keys(s).length > 0, 'Mindst én sektion kræves'),
  ignoredFolders: z.array(z.string().min(1)).default([]),
}).superRefine((c, ctx) => {
  for (const name of c.ignoredFolders) if (name in c.sections) ctx.addIssue({ code: 'custom', message: `${name}: både sektion og ignoreret mappe` });
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SectionConfig = SiteConfig['sections'][string];
