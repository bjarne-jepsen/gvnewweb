/** Short teaser for a news item on the front page, so the front page does not repeat the whole notice.
 *
 * Rules (see docs/teaser.md for the reasons):
 * 1. Text that fits within `max` characters is shown whole. Cutting it would hide information and save little.
 * 2. Otherwise keep whole sentences from the start, as many as fit. A complete sentence reads better than a fragment.
 *    The closing full stop gives way to " …", so the reader sees there is more.
 * 3. If the first sentence alone is too long, or the kept sentences are shorter than `min`, cut at a word
 *    boundary, never inside a word. Trailing punctuation and short connecting words ("og", "at", "i" …) are
 *    dropped, and " …" marks the cut (Danish style: a space before the dots when whole words are left out).
 * 4. Full stops after numbers ("1. juni"), abbreviations ("fx.", "dvs.") and initials do not end a sentence.
 *
 * The cut is made in the HTML at build time, not with CSS line-clamp, so screen readers get the same short
 * text as everyone else and the cut never falls inside a word. */
export const TEASER_MAX = 160, TEASER_MIN = 60;

const abbreviations = new Set(['bl.a', 'ca', 'dvs', 'evt', 'f.eks', 'fx', 'hhv', 'inkl', 'ekskl', 'jf', 'kl', 'mht', 'mv', 'nr', 'osv', 'pga', 'tlf', 'vedr', 'etc', 'st', 'ift']);
const connectors = new Set(['og', 'eller', 'men', 'at', 'som', 'der', 'i', 'på', 'til', 'for', 'med', 'om', 'af', 'fra', 'en', 'et', 'den', 'det', 'de', 'hvis', 'når', 'så', 'samt']);

/** The text split after each sentence end. Joining the parts gives back the text. */
export function sentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?…]+["'”»)]*(?=\s+["'“«(]?[\p{Lu}\d])/gu)) {
    const end = m.index! + m[0].length;
    const word = text.slice(start, m.index! + 1).split(/\s+/).pop()!.replace(/^[("'“«]+/, '').toLocaleLowerCase('da-DK').replace(/\.$/, '');
    // A full stop after an abbreviation or a single initial ("H. C.") is not a sentence end.
    if (m[0] === '.' && (abbreviations.has(word) || /^\p{L}$/u.test(word))) continue;
    parts.push(text.slice(start, end));
    start = end;
  }
  parts.push(text.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}

function cutAtWord(text: string, max: number) {
  const room = max - 2; // room for " …"
  const words = text.slice(0, room).split(' ');
  if (text[room] !== ' ' && words.length > 1) words.pop(); // the last word was cut in the middle
  const strip = (w: string) => w.replace(/[\s,.;:!?–—-]+$/, '');
  while (words.length > 1 && (connectors.has(strip(words.at(-1)!).toLocaleLowerCase('da-DK')) || !strip(words.at(-1)!))) words.pop();
  return `${strip(words.join(' '))} …`;
}

export function teaser(input: string, max = TEASER_MAX, min = TEASER_MIN) {
  const text = input.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  let kept = '';
  for (const s of sentences(text)) {
    const next = kept ? `${kept} ${s}` : s;
    if (next.length > max) break;
    kept = next;
  }
  // Every shortened text ends with " …". A kept full stop gives way to it; "!" and "?" stay.
  return kept.length >= min ? `${kept.replace(/\.$/, '')} …` : cutAtWord(text, max);
}
