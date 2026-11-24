import type { SiteItem, SiteSection } from './load';

export type RssItem = Pick<Extract<SiteItem, { kind: 'notice' }>, 'title' | 'path' | 'summary' | 'html' | 'date'>;

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const plainText = (html: string) =>
  html.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();

/** Calendar date YYYY-MM-DD as RFC 2822 at 00:00:00 GMT, so Copenhagen time lands on the same day. */
const rfc2822 = (isoDay: string) => new Date(`${isoDay}T00:00:00Z`).toUTCString();

export const rssPath = (section: Pick<SiteSection, 'path'>) => `${section.path}rss.xml`;
export const rssFile = (section: Pick<SiteSection, 'path'>) => rssPath(section).slice(1);
export const rssGuidePath = (section: Pick<SiteSection, 'path'>) => `${section.path}rss/`;
export const rssGuideFile = (section: Pick<SiteSection, 'path'>) => `${rssGuidePath(section).slice(1)}index.html`;

/** Deterministic RSS 2.0 feed for one news section. Every value is XML-escaped; no raw CDATA. */
export function renderRss(
  section: Pick<SiteSection, 'label' | 'leadHtml' | 'path'>,
  items: readonly RssItem[],
  origin: string,
): string {
  const description = plainText(section.leadHtml) || `${section.label} fra Andelsboligforeningen Grøndalsvænge.`;
  const selfUrl = `${origin}${rssPath(section)}`;
  const channelUrl = `${origin}${section.path}`;
  const latest = items.reduce<string | undefined>((max, item) => (!max || item.date > max ? item.date : max), undefined);
  const body = items.map(item => {
    const url = `${origin}${item.path}`;
    const absoluteHtml = item.html.replace(/href="(\/[^"]*)"/g, (_, p: string) => `href="${origin}${p}"`);
    return [
      '<item>',
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<pubDate>${rfc2822(item.date)}</pubDate>`,
      `<description>${escapeXml(item.summary)}</description>`,
      `<content:encoded>${escapeXml(absoluteHtml)}</content:encoded>`,
      '</item>',
    ].join('');
  }).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '<channel>',
    `<title>${escapeXml(`${section.label} · Grøndalsvænge`)}</title>`,
    `<link>${escapeXml(channelUrl)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    '<language>da</language>',
    `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    latest ? `<lastBuildDate>${rfc2822(latest)}</lastBuildDate>` : '',
    body,
    '</channel>',
    '</rss>',
  ].join('');
}
