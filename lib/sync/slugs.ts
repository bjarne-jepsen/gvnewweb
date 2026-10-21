import { z } from 'zod';
import { driveIdSchema } from './drive';
import { sectionKey } from './config';

const segment = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const slugSchema = z.string().regex(new RegExp(`^${segment}$`)).max(80);
const pathSchema = z.string().regex(new RegExp(`^/${segment}/${segment}/$`));
export const slugEntrySchema = z.strictObject({ section: sectionKey, slug: slugSchema, previousPaths: z.array(pathSchema) });
/** id → stable URL. Maintained by sync; only a developer changes an existing slug (see setSlug). */
export const slugsSchema = z.record(driveIdSchema, slugEntrySchema);
export type SlugEntry = z.infer<typeof slugEntrySchema>;
export type Slugs = z.infer<typeof slugsSchema>;
export const pathOf = (e: Pick<SlugEntry, 'section' | 'slug'>) => `/${e.section}/${e.slug}/`;

export function slugify(title: string, id: string) {
  const slug = title.normalize('NFC').toLocaleLowerCase('da-DK').replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return slug || `side-${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'uden-titel'}`;
}

/** Paths that a new or moved entry may not take: live pages and their redirects. */
export function takenPaths(slugs: Slugs, activeIds: Iterable<string>, except?: string) {
  const taken = new Set<string>();
  for (const id of activeIds) {
    const entry = slugs[id];
    if (!entry || id === except) continue;
    taken.add(pathOf(entry)); entry.previousPaths.forEach(p => taken.add(p));
  }
  return taken;
}

/** Developer-only rename: the old path becomes a redirect. */
export function setSlug(slugs: Slugs, id: string, slug: string): Slugs {
  const entry = slugs[id];
  if (!entry) throw new Error(`${id}: ukendt ID i _slugs.json`);
  const next = slugSchema.parse(slug);
  if (next === entry.slug) return slugs;
  const target = pathOf({ section: entry.section, slug: next });
  for (const [otherId, other] of Object.entries(slugs)) {
    if (otherId !== id && (pathOf(other) === target || other.previousPaths.includes(target))) throw new Error(`${target} bruges allerede af ${otherId}`);
  }
  const previousPaths = [...new Set([...entry.previousPaths, pathOf(entry)])].filter(p => p !== target);
  return { ...slugs, [id]: { ...entry, slug: next, previousPaths } };
}

export const serializeSlugs = (slugs: Slugs) =>
  JSON.stringify(Object.fromEntries(Object.entries(slugs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), null, 2) + '\n';
