import { z } from 'zod';
import type { BodyBlock, Inline } from '../contracts/blocks';
import { googleDocsBlocks } from '../google/docs';
import { driveIdSchema, type DriveItem, type DriveSource } from './drive';
import { flattenBlocks, plainText, type SerializableBlock } from './markdown';

/** content/_forside.json, written by sync from the _forside document in the root folder.
 * intro: plain paragraphs separated by a blank line. shortcuts: "Det vigtigste", in the document's order,
 * as Drive IDs; the build turns each ID into the page's address, so a renamed or moved page keeps its link. */
export const frontpageSchema = z.strictObject({
  intro: z.string().max(2000),
  shortcuts: z.array(z.strictObject({ label: z.string().min(1).max(200), id: driveIdSchema })).max(24),
});
export type Frontpage = z.infer<typeof frontpageSchema>;
export const FRONTPAGE_FILE = '_forside.json';
export const isFrontpageDoc = (i: DriveItem) => i.name.normalize('NFC').trim().toLowerCase() === '_forside';
export const serializeFrontpage = (f: Frontpage) => JSON.stringify(frontpageSchema.parse(f), null, 2) + '\n';

/** The document ID in a link to a Google Doc, e.g. https://docs.google.com/document/d/<id>/edit. */
export function docIdOf(href: string | undefined) {
  const m = href && /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/.exec(href);
  return m ? m[1] : undefined;
}
/** The folder ID in a link to a Drive folder, e.g. https://drive.google.com/drive/folders/<id>. */
export function folderIdOf(href: string | undefined) {
  const m = href && /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/.exec(href);
  return m ? m[1] : undefined;
}
const oneLine = (runs: Inline[]) => plainText(runs).replace(/\s+/g, ' ').trim();

/** Paragraphs are the intro; each bullet with a link to a Google Doc is a shortcut, labelled with
 * the bullet's text. Headings are for the editors and are left out. Bullets without such a link are returned as problems. */
export function parseFrontpage(blocks: BodyBlock[]) {
  const intro: string[] = [], shortcuts: Frontpage['shortcuts'] = [], problems: string[] = [];
  for (const b of flattenBlocks(blocks as SerializableBlock[])) {
    if (b.type === 'paragraph') { const text = oneLine(b.content); if (text) intro.push(text); }
    else if (b.type === 'list') for (const item of b.items) {
      const label = oneLine(item), ids = [...new Set(item.map(r => docIdOf(r.href)).filter(id => id !== undefined))];
      if (ids.length !== 1) { problems.push(`"${label}" ${ids.length ? 'har links til flere dokumenter' : 'har intet link til et Google-dokument'}; punktet springes over`); continue; }
      if (shortcuts.some(s => s.id === ids[0])) { problems.push(`"${label}" står der allerede; punktet springes over`); continue; }
      shortcuts.push({ label: label.slice(0, 200), id: ids[0]! });
    }
  }
  const text = intro.join('\n\n');
  if (text.length > 2000) throw new Error('Introen er for lang (højst 2000 tegn)');
  if (shortcuts.length > 24) throw new Error('Der er for mange punkter under Det vigtigste (højst 24)');
  return { frontpage: { intro: text, shortcuts }, problems };
}

export async function fetchFrontpage(drive: DriveSource, id: string) {
  const { bodyBlocks } = await googleDocsBlocks(await drive.readDocument(id), id, async () => { throw new Error('Forsiden kan ikke have billeder'); });
  return parseFrontpage(bodyBlocks);
}
