import { readFile } from 'node:fs/promises';
import type { APIRoute, InferGetStaticPropsType } from 'astro';
import { getCollection } from 'astro:content';
import { renderRss } from '../../../lib/site/rss';
import { siteConfigSchema } from '../../../lib/sync/config';

export async function getStaticPaths() {
  const { siteUrl } = siteConfigSchema.parse(JSON.parse(await readFile('config/site.json', 'utf8')));
  const origin = new URL(siteUrl).origin;
  const items = (await getCollection('items')).map(i => i.data).filter(i => i.kind === 'notice');
  return (await getCollection('sections'))
    .map(s => s.data)
    .filter(s => s.news)
    .map(section => ({
      params: { section: section.key },
      props: { section, items: items.filter(i => i.section === section.key), origin },
    }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = ({ props }) =>
  new Response(renderRss(props.section, props.items, props.origin), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
