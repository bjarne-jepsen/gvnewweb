import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { loadSite } from '../lib/site/load';

// Inline loaders over the same validated dataset the build script copies files from and checks.
let site: ReturnType<typeof loadSite> | undefined;
const load = () => (site ??= loadSite());
const path = z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/);
const base = { section: z.string(), slug: z.string(), path, title: z.string(), updatedAt: z.string(), summary: z.string(),
  search: z.object({ headings: z.array(z.string()), text: z.string(), keywords: z.array(z.string()) }) };

export const collections = {
  frontpage: defineCollection({
    loader: async () => [{ id: 'forside', ...(await load()).frontpage }],
    schema: z.object({ intro: z.string() }),
  }),
  sections: defineCollection({
    loader: async () => (await load()).sections.map(s => ({ id: s.key, ...s })),
    schema: z.object({ key: z.string(), order: z.number(), label: z.string(), leadHtml: z.string(), bodyHtml: z.string(), path, news: z.boolean() }),
  }),
  items: defineCollection({
    loader: async () => (await load()).items,
    schema: z.discriminatedUnion('kind', [
      z.object({ ...base, kind: z.literal('page'), html: z.string(), image: z.object({ src: z.string().regex(/^\/(?:[a-z0-9-]+\/)+[a-f0-9]{16}\.(?:png|jpg|webp)$/), alt: z.string().min(1) }).optional() }),
      z.object({ ...base, kind: z.literal('notice'), html: z.string(), date: z.iso.date(), expires: z.iso.date().optional() }),
    ]),
  }),
  links: defineCollection({
    loader: async () => (await load()).links,
    schema: z.object({ group: z.enum(['shortcut', 'footer']), order: z.number(), label: z.string(), href: z.string(), external: z.boolean() }),
  }),
  redirects: defineCollection({
    loader: async () => (await load()).redirects.map(r => ({ id: r.from, ...r })),
    schema: z.object({ from: z.string(), to: path }),
  }),
};
