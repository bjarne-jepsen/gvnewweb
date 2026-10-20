import { z } from 'zod';
import type { BodyBlock, Inline, TextBlock } from '../../contracts/blocks';
const obj = z.record(z.string(), z.unknown());
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => obj.parse(v);
const present = (v: unknown) => Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v);
function checkSuggestions(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if ((key.startsWith('suggested') || key === 'suggestions') && present(v)) throw new Error('Google Docs: løs forslag før import');
    checkSuggestions(v);
  }
}
export type ResolveImage = (id: string, embedded: Obj) => Promise<Extract<BodyBlock, {type: 'image'}>>;
export async function googleDocsBlocks(input: unknown, expectedId: string, resolveImage: ResolveImage) {
  const doc = object(input);
  if (doc.documentId !== expectedId || typeof doc.title !== 'string') throw new Error('Google Docs: forkert eller ugyldigt dokument');
  if (doc.suggestionsViewMode !== 'SUGGESTIONS_INLINE') throw new Error('Google Docs: forslag skal være synlige ved validering');
  checkSuggestions(doc);
  const tabs = z.array(obj).parse(doc.tabs);
  if (tabs.length !== 1 || present(tabs[0]!.childTabs)) throw new Error('Google Docs: piloten kræver præcis én fane uden underfaner');
  const tab = object(tabs[0]!.documentTab);
  for (const key of ['headers', 'footers', 'footnotes', 'positionedObjects']) if (present(tab[key])) throw new Error(`Google Docs: ${key} understøttes ikke i piloten`);
  const listMetadata = object(tab.lists ?? {}), images = object(tab.inlineObjects ?? {});
  const imageCache = new Map<string, Extract<BodyBlock, {type: 'image'}>>();
  async function convert(content: unknown, inCell = false): Promise<BodyBlock[]> {
    const blocks: BodyBlock[] = [];
    for (const element of z.array(obj).parse(content)) {
      if (element.sectionBreak && !element.paragraph && !element.table) continue;
      if (element.table) {
        if (inCell) throw new Error('Google Docs: indlejrede tabeller understøttes ikke');
        const table = object(element.table), rows = [];
        for (const row of z.array(obj).parse(table.tableRows)) {
          const cells = [];
          for (const cell of z.array(obj).parse(row.tableCells)) {
            const style = object(cell.tableCellStyle ?? {});
            if ((style.rowSpan ?? 1) !== 1 || (style.columnSpan ?? 1) !== 1) throw new Error('Google Docs: flettede tabelceller understøttes ikke');
            cells.push(await convert(cell.content, true) as TextBlock[]);
          }
          rows.push(cells);
        }
        blocks.push({ type: 'table', rows }); continue;
      }
      if (!element.paragraph) throw new Error('Google Docs: ikke-understøttet strukturelement');
      const p = object(element.paragraph);
      if (present(p.positionedObjectIds)) throw new Error('Google Docs: forankrede objekter understøttes ikke');
      const style = object(p.paragraphStyle ?? {});
      const heading = typeof style.namedStyleType === 'string' ? /^(?:HEADING_([1-6])|TITLE|SUBTITLE)$/.exec(style.namedStyleType) : null;
      let content: Inline[] = [];
      const flush = () => {
        // Remove the mandatory paragraph terminator while retaining explicit soft line breaks.
        const last = content.at(-1); if (last) last.text = last.text.replace(/\n$/, '');
        if (!content.some(run => run.text.trim())) { content = []; return; }
        if (p.bullet) {
          const bullet = object(p.bullet);
          if ((bullet.nestingLevel ?? 0) !== 0) throw new Error('Google Docs: indrykkede lister understøttes ikke');
          const list = object(listMetadata[z.string().parse(bullet.listId)]);
          const levels = z.array(obj).parse(object(list.listProperties).nestingLevels);
          if (!levels[0] || (levels[0].glyphType && !['NONE','GLYPH_TYPE_UNSPECIFIED'].includes(String(levels[0].glyphType)))) throw new Error('Google Docs: nummererede lister understøttes ikke');
          const previous = blocks.at(-1);
          if (previous?.type === 'list') previous.items.push(content); else blocks.push({ type: 'list', items: [content] });
        } else blocks.push(heading ? { type: 'heading', level: Math.max(2, Number(heading[1] ?? 2)), content } : { type: 'paragraph', content });
        content = [];
      };
      for (const element of z.array(obj).parse(p.elements)) {
        if (element.textRun) {
          const run = object(element.textRun), style = object(run.textStyle ?? {});
          const link = style.link ? object(style.link) : undefined;
          const href = link ? z.url().parse(link.url) : undefined;
          if (href && !['http:', 'https:'].includes(new URL(href).protocol)) throw new Error('Google Docs: kun HTTP(S)-links understøttes');
          content.push({ text: z.string().parse(run.content).replace(/\u000b/g, '\n'), ...(href ? { href } : {}), ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}) });
        } else if (element.inlineObjectElement) {
          if (inCell) throw new Error('Google Docs: billeder i tabelceller understøttes ikke');
          flush();
          const id = z.string().parse(object(element.inlineObjectElement).inlineObjectId);
          if (!imageCache.has(id)) imageCache.set(id, await resolveImage(id, object(object(object(images[id]).inlineObjectProperties).embeddedObject)));
          blocks.push(imageCache.get(id)!);
        } else if (element.horizontalRule) {
          if (inCell) throw new Error('Google Docs: skillelinjer i tabelceller understøttes ikke');
          flush(); blocks.push({ type: 'separator' });
        } else throw new Error('Google Docs: ikke-understøttet afsnitselement');
      }
      flush();
    }
    return blocks;
  }
  const bodyBlocks = await convert(object(tab.body).content);
  if (!bodyBlocks.length) throw new Error('Google Docs: tom vejledning');
  return { title: doc.title, bodyBlocks };
}
