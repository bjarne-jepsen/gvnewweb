import { getCollection } from 'astro:content';
export const GET = async () => new Response(JSON.stringify((await getCollection('items')).map(({ data }) => ({ title: data.title, summary: data.summary, url: data.path }))), { headers: { 'Content-Type': 'application/json' } });
