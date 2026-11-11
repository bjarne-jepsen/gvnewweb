/** The panel "På denne side" (docs/cvi.md § 5): the H2s of a rendered body, and the body split after
 * its first paragraph (the intro), so that on narrow screens the panel can stand under the intro.
 * The HTML comes from renderBody, which escapes all text, so the labels are safe to insert as HTML. */
export const TOC_MIN_HEADINGS = 3;

export function tableOfContents(html: string) {
  const headings = [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(m => ({ id: m[1]!, label: m[2]!.replace(/<[^>]*>/g, '') }));
  const lead = html.startsWith('<p>') ? html.slice(0, html.indexOf('</p>') + 4) : '';
  return { headings: headings.length >= TOC_MIN_HEADINGS ? headings : [], lead, rest: html.slice(lead.length) };
}
