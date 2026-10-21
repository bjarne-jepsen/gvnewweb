import type { Inline } from '../contracts/blocks';
import type { SheetCell } from '../google/sheets';
import { newsIdPattern } from './content';

export interface NewsRow { id: string; title: string; date: string; expires?: string; paragraphs: Inline[][] }
/** A row that is not published. With an id, its last valid version is kept. */
export interface NewsProblem { id?: string; title: string; message: string; warning?: boolean }

const columns = { id: 'id', date: 'dato', title: 'titel', text: 'tekst', expires: 'udløber', status: 'status' } as const;
const required = ['id', 'date', 'title', 'text', 'status'] as const;

function isoDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}
/** A date cell (serial number) or text as 2026-10-21, 21-10-2026, 21.10.2026 or 21/10/2026. */
export function parseDate(cell: SheetCell | undefined) {
  if (!cell) return undefined;
  const text = cell.text.trim();
  if (cell.number !== undefined && !/^\d{4}-/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell.number) * 86_400_000);
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(text);
  return m ? isoDate(Number(m[3]), Number(m[2]), Number(m[1])) : undefined;
}

const urlPattern = /https?:\/\/[^\s<>"]+/g;
function autolink(run: Inline): Inline[] {
  if (run.href) return [run];
  const out: Inline[] = []; let last = 0;
  for (const match of run.text.matchAll(urlPattern)) {
    const url = match[0].replace(/[.,;:!?)\]]+$/, ''), start = match.index!;
    try { if (!/^https?:$/.test(new URL(url).protocol)) continue; } catch { continue; }
    if (start > last) out.push({ text: run.text.slice(last, start) });
    out.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < run.text.length) out.push({ text: run.text.slice(last) });
  return out;
}
/** A blank line starts a new paragraph; a single line break stays a line break. */
export function paragraphsOf(runs: Inline[]) {
  const paragraphs: Inline[][] = [[]];
  for (const run of runs) run.text.split(/\n[ \t]*\n\s*/).forEach((text, i) => {
    if (i > 0) paragraphs.push([]);
    if (text) paragraphs.at(-1)!.push(...autolink({ ...run, text }));
  });
  return paragraphs.map(p => p.filter(r => r.text)).filter(p => p.some(r => r.text.trim()));
}

/** Reads the news sheet. A missing header column is a sheet-level error (throws); row problems are returned. */
export function parseNews(sheet: SheetCell[][]) {
  const header = (sheet[0] ?? []).map(c => c.text.trim().toLocaleLowerCase('da-DK'));
  const at = Object.fromEntries(Object.entries(columns).map(([key, name]) => [key, header.indexOf(name)])) as Record<keyof typeof columns, number>;
  for (const key of required) if (at[key] < 0) throw new Error(`Nyhedsarket mangler kolonnen "${columns[key]}" i første række`);
  for (const name of Object.values(columns)) if (header.filter(h => h === name).length > 1) throw new Error(`Nyhedsarket har kolonnen "${name}" flere gange`);
  const rows: NewsRow[] = [], problems: NewsProblem[] = [];
  let drafts = 0;
  sheet.slice(1).forEach((cells, index) => {
    if (!cells.some(c => c.text.trim())) return;
    const get = (key: keyof typeof columns) => at[key] < 0 ? undefined : cells[at[key]];
    const status = (get('status')?.text ?? '').trim(), title = (get('title')?.text ?? '').replace(/\s+/g, ' ').trim();
    const label = title || `Række ${index + 2}`, rawId = (get('id')?.text ?? '').trim();
    if (status === '' || status.toLocaleLowerCase('da-DK') === 'kladde') { drafts++; return; }
    if (status.toLocaleLowerCase('da-DK') !== 'offentlig') { problems.push({ title: label, message: `Ukendt status "${status}"; publiceres ikke`, warning: true }); return; }
    if (!newsIdPattern.test(rawId)) { problems.push({ title: label, message: rawId ? `Ugyldigt ID "${rawId.slice(0, 40)}"` : 'Mangler ID; publiceres ikke' }); return; }
    const fail = (message: string) => problems.push({ id: rawId, title: label, message });
    if (!title) return fail('Mangler titel');
    const date = parseDate(get('date'));
    if (!date) return fail('Ugyldig eller manglende dato');
    const expiresCell = get('expires'), expires = expiresCell?.text.trim() ? parseDate(expiresCell) : undefined;
    if (expiresCell?.text.trim() && !expires) return fail('Ugyldig udløbsdato');
    if (expires && expires < date) return fail('Udløbsdatoen ligger før datoen');
    const paragraphs = paragraphsOf(get('text')?.runs ?? []);
    if (!paragraphs.length) return fail('Mangler tekst');
    rows.push({ id: rawId, title, date, ...(expires ? { expires } : {}), paragraphs });
  });
  return { rows, problems, drafts };
}
