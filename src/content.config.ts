import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { loadSite } from '../lib/site/load';

// Inline loaders over the same validated dataset the build script copies files from and checks.
let site: ReturnType<typeof loadSite> | undefined;
const load = () => (site ??= loadSite());
const path = z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/);
const base = { section: z.string(), slug: z.string(), path, title: z.string(), updatedAt: z.string(), summary: z.string() };

export const collections = {
  sections: defineCollection({
    loader: async () => (await load()).sections.map(s => ({ id: s.key, ...s })),
    schema: z.object({ key: z.string(), order: z.number(), label: z.string(), intro: z.string(), path }),
  }),
  items: defineCollection({
    loader: async () => (await load()).items,
    schema: z.discriminatedUnion('kind', [
      z.object({ ...base, kind: z.literal('page'), html: z.string() }),
      z.object({ ...base, kind: z.literal('document'), download: z.string(), sizeBytes: z.number() }),
      z.object({ ...base, kind: z.literal('notice'), html: z.string(), date: z.iso.date(), expires: z.iso.date().optional() }),
    ]),
  }),
  redirects: defineCollection({
    loader: async () => (await load()).redirects.map(r => ({ id: r.from, ...r })),
    schema: z.object({ from: z.string(), to: path }),
  }),
};
