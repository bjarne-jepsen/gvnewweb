import { records, url } from '../../lib/site/content';
export const GET = () => new Response(JSON.stringify(records.map(r => ({ title: r.title, summary: r.summary, url: url(r) }))), { headers: { 'Content-Type': 'application/json' } });
