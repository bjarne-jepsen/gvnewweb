import { z } from 'zod';
import { safeHref, type Inline } from '../contracts/blocks';

export interface SheetCell { text: string; number?: number; runs: Inline[] }
const httpUrl = safeHref; // cell links: http(s) or mailto to one address; anything else stays plain text
const cellSchema = z.looseObject({
  formattedValue: z.string().optional(), hyperlink: z.string().optional(),
  effectiveValue: z.looseObject({ numberValue: z.number().optional() }).optional(),
  textFormatRuns: z.array(z.object({ startIndex: z.number().int().nonnegative().optional(), format: z.looseObject({ link: z.object({ uri: z.string().optional() }).optional() }).optional() })).optional(),
});
const gridSchema = z.object({ sheets: z.array(z.object({ data: z.array(z.object({ rowData: z.array(z.object({ values: z.array(cellSchema).optional() })).optional() })).optional() })).min(1) });

/** spreadsheets.get with grid data → rows of cells from the first sheet. Cell links come from
 * textFormatRuns (rich text) or hyperlink (whole cell); only http(s) links are kept. */
export function sheetRows(input: unknown): SheetCell[][] {
  const rows = gridSchema.parse(input).sheets[0]!.data?.[0]?.rowData ?? [];
  return rows.map(row => (row.values ?? []).map(cell => {
    const text = (cell.formattedValue ?? '').replace(/\r\n?/g, '\n').normalize('NFC');
    const number = cell.effectiveValue?.numberValue;
    const runs: Inline[] = [];
    const formatRuns = (cell.textFormatRuns ?? []).map(r => ({ start: r.startIndex ?? 0, href: httpUrl(r.format?.link?.uri) })).sort((a, b) => a.start - b.start);
    if (formatRuns.length) {
      if (formatRuns[0]!.start > 0) runs.push({ text: text.slice(0, formatRuns[0]!.start) });
      formatRuns.forEach((r, i) => {
        const part = text.slice(r.start, formatRuns[i + 1]?.start ?? text.length);
        if (part) runs.push(r.href ? { text: part, href: r.href } : { text: part });
      });
    } else if (text) {
      const href = httpUrl(cell.hyperlink);
      runs.push(href ? { text, href } : { text });
    }
    return { text, ...(number !== undefined ? { number } : {}), runs };
  }));
}
