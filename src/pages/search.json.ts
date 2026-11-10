import { getCollection } from 'astro:content';

/** The search index: every public page and current news item, with its section's menu name.
 * Built from the same collection as the pages, so it can never list anything the site does not show. */
export const GET = async () => {
  const sections = new Map((await getCollection('sections')).map(s => [s.data.key, s.data.label]));
  const items = (await getCollection('items')).map(({ data }) => ({
    title: data.title, summary: data.summary, url: data.path, section: sections.get(data.section) ?? '',
    headings: data.search.headings, keywords: data.search.keywords, text: data.search.text,
  }));
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};
