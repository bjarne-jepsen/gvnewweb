import { flattenBlocks, plainText, type SerializableBlock } from './markdown';

/** The section with this address is the news section. The address is fixed the first time the
 * folder is seen, so renaming "50 Nyheder" keeps it a news section. */
export const NEWS_SECTION = 'nyheder';

const months = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
function isoDate(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}
/** 2026-10-21, 21-10-2026, 21.10.2026, 21/10/2026 or 21. oktober 2026 (also "21 okt. 2026"). */
export function parseDate(input: string) {
  const text = input.trim().toLocaleLowerCase('da-DK');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(text);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\.?\s+([a-zæøå]{3,})\.?\s+(\d{4})$/.exec(text);
  const month = m ? months.findIndex(name => name.startsWith(m![2]!)) : -1;
  return m && month >= 0 ? isoDate(Number(m[3]), month + 1, Number(m[1])) : undefined;
}

const dateLine = /^\s*dato\s*:\s*/i, expiresLine = /^\s*vises\s+til\s*:\s*/i;
/** "Dato: 21.10.2026" and "Vises til: 31.10.2026" paragraphs set the news item's dates and are left out of the text.
 * Without a Dato line the date is undefined; sync then uses the date the item was first published. */
export function extractNewsDates(input: SerializableBlock[]): { blocks: SerializableBlock[]; date?: string; expires?: string } {
  const blocks: SerializableBlock[] = [], found: { date?: string; expires?: string } = {};
  for (const b of flattenBlocks(input)) {
    const text = b.type === 'paragraph' ? plainText(b.content) : '';
    const [key, label, line] = dateLine.test(text) ? ['date', 'Dato', dateLine] as const : expiresLine.test(text) ? ['expires', 'Vises til', expiresLine] as const : [];
    if (!key) { blocks.push(b); continue; }
    if (found[key]) throw new Error(`Linjen "${label}:" står der flere gange`);
    const value = text.replace(line, '').trim(), date = parseDate(value);
    if (!date) throw new Error(`"${label}: ${value.slice(0, 40)}" er ikke en gyldig dato. Skriv fx ${label}: 21.10.2026`);
    found[key] = date;
  }
  if (found.date && found.expires && found.expires < found.date) throw new Error('"Vises til" ligger før datoen');
  return { blocks, ...found };
}
