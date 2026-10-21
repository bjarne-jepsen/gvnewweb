// Developer-only: change a published slug; the old path is kept as a redirect.
import { readFile, writeFile } from 'node:fs/promises';
import { pathOf, serializeSlugs, setSlug, slugsSchema } from '../lib/sync/slugs';

const [id, slug] = process.argv.slice(2);
if (!id || !slug) throw new Error('Brug: bun run slug -- <drive-id> <nyt-slug>');
const slugs = setSlug(slugsSchema.parse(JSON.parse(await readFile('content/_slugs.json', 'utf8'))), id, slug);
await writeFile('content/_slugs.json', serializeSlugs(slugs));
console.log(`${id}: ny adresse ${pathOf(slugs[id]!)}; tidligere: ${slugs[id]!.previousPaths.join(', ')}`);
