import { z } from 'zod';
import { driveIdSchema } from './drive';

/** Only what cannot come from Drive. The sections are the numbered folders in the root (lib/sync/sections.ts). */
export const siteConfigSchema = z.strictObject({
  rootFolderId: driveIdSchema,
  // The public address, used in the sitemap. https and no path.
  siteUrl: z.url().refine(u => { const url = new URL(u); return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash; }, 'siteUrl skal være https uden sti').default('https://example.invalid'),
  // External links shown by the site. ProBo holds the association's documents.
  links: z.strictObject({ probo: z.url().refine(u => new URL(u).protocol === 'https:', 'ProBo-linket skal bruge https').optional() }).default({}),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;
