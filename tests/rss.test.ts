import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostFiles } from '../lib/site/hosting';
import type { Site } from '../lib/site/load';
import { renderRss, rssFile, rssGuideFile, rssGuidePath, rssPath } from '../lib/site/rss';
import { verifyOutput } from '../scripts/verify-output';

const section = { label: 'Nyheder', leadHtml: '<p class="intro">Nyt fra foreningen &amp; bestyrelsen.</p>', path: '/nyheder/' };

test('renderRss skriver gyldig RSS 2.0 med escaping, RFC 2822-datoer, absolutte links og fuld HTML i content:encoded', () => {
  const xml = renderRss(section, [
    {
      title: 'Vandet lukkes & "ekstra" <info>',
      path: '/nyheder/2026-10-21-vandet-lukkes/',
      summary: "Vi lukker vandet mandag 'kl. 9'.",
      html: '<p>Vi lukker vandet mandag &#39;kl. 9&#39;. Se <a href="/foreningen/kontakt/">Kontakt</a> og <a href="https://groendalsvaenge.dk/?a=1&amp;b=2" rel="noreferrer">hjemmesiden</a>.</p>',
      date: '2026-10-21',
    },
    {
      title: 'Ældre nyhed med æøå',
      path: '/nyheder/2026-09-05-aeldre-nyhed/',
      summary: 'Kort besked.',
      html: '<p>Kort besked.</p>',
      date: '2026-09-05',
    },
  ], 'https://newweb.groendalsvaenge.dk');

  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">');
  expect(xml).toContain('<title>Nyheder · Grøndalsvænge</title>');
  expect(xml).toContain('<link>https://newweb.groendalsvaenge.dk/nyheder/</link>');
  expect(xml).toContain('<description>Nyt fra foreningen &amp; bestyrelsen.</description>');
  expect(xml).toContain('<language>da</language>');
  expect(xml).toContain('<atom:link href="https://newweb.groendalsvaenge.dk/nyheder/rss.xml" rel="self" type="application/rss+xml"/>');
  expect(xml).toContain('<lastBuildDate>Wed, 21 Oct 2026 00:00:00 GMT</lastBuildDate>');
  expect(xml).toContain('<title>Vandet lukkes &amp; &quot;ekstra&quot; &lt;info&gt;</title>');
  expect(xml).toContain('<guid isPermaLink="true">https://newweb.groendalsvaenge.dk/nyheder/2026-10-21-vandet-lukkes/</guid>');
  expect(xml).toContain('<pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate>');
  expect(xml).toContain('<description>Vi lukker vandet mandag &apos;kl. 9&apos;.</description>');
  expect(xml).toContain('href=&quot;https://newweb.groendalsvaenge.dk/foreningen/kontakt/&quot;');
  expect(xml).toContain('<title>Ældre nyhed med æøå</title>');
  expect(xml).toContain('<pubDate>Sat, 05 Sep 2026 00:00:00 GMT</pubDate>');
  expect(rssPath(section)).toBe('/nyheder/rss.xml');
  expect(rssFile(section)).toBe('nyheder/rss.xml');
  expect(rssGuidePath(section)).toBe('/nyheder/rss/');
  expect(rssGuideFile(section)).toBe('nyheder/rss/index.html');
});

test('renderRss uden nyheder og uden intro er stadig gyldig og deterministisk', () => {
  const xml = renderRss({ label: 'Nyheder', leadHtml: '', path: '/nyheder/' }, [], 'https://example.invalid');
  expect(xml).toContain('<description>Nyheder fra Andelsboligforeningen Grøndalsvænge.</description>');
  expect(xml).not.toContain('<lastBuildDate>');
  expect(xml).not.toContain('<item>');
  expect(renderRss({ label: 'Nyheder', leadHtml: '', path: '/nyheder/' }, [], 'https://example.invalid')).toBe(xml);
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

test('verifyOutput afviser manglende eller manipuleret rss.xml', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gv-rss-')); roots.push(root);
  const site: Site = {
    frontpage: { intro: 'Intro' },
    sections: [{ key: 'nyheder', order: 0, label: 'Nyheder', leadHtml: '<p class="intro">Nyt.</p>', bodyHtml: '', path: '/nyheder/', news: true }],
    items: [{
      id: 'n-1', section: 'nyheder', slug: '2026-10-21-test', path: '/nyheder/2026-10-21-test/',
      title: 'Test', updatedAt: '2026-10-21T10:00:00Z', kind: 'notice', summary: 'Hej', html: '<p>Hej</p>',
      date: '2026-10-21', search: { headings: [], text: 'Hej', keywords: [] },
    }],
    redirects: [], links: [], assets: new Map(), warnings: [], internalIds: [],
    buildDay: '2026-10-21', origin: 'https://example.invalid',
  };
  await mkdir(join(root, 'nyheder/2026-10-21-test'), { recursive: true });
  await mkdir(join(root, 'nyheder/rss'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<html></html>');
  await writeFile(join(root, 'nyheder/index.html'), '<html></html>');
  await writeFile(join(root, 'nyheder/rss/index.html'), '<html></html>');
  await writeFile(join(root, 'nyheder/2026-10-21-test/index.html'), '<html></html>');
  await writeFile(join(root, 'search.json'), JSON.stringify([{ url: '/nyheder/2026-10-21-test/' }]));
  await writeFile(join(root, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.invalid/</loc></url><url><loc>https://example.invalid/nyheder/</loc></url><url><loc>https://example.invalid/nyheder/2026-10-21-test/</loc></url></urlset>');
  for (const [name, text] of hostFiles(site)) await writeFile(join(root, name), text);
  const validRss = renderRss(site.sections[0]!, site.items as Extract<Site['items'][number], { kind: 'notice' }>[], site.origin);
  await writeFile(join(root, 'nyheder/rss.xml'), validRss);
  await verifyOutput(root, site);

  // Manipulated feed with an extra item is rejected.
  await writeFile(join(root, 'nyheder/rss.xml'), validRss.replace('</channel>', '<item><link>https://example.invalid/nyheder/ekstra/</link></item></channel>'));
  await rejects(verifyOutput(root, site), /RSS-feed nyheder\/rss\.xml afviger/);

  // Empty feed when one item is expected is rejected.
  await writeFile(join(root, 'nyheder/rss.xml'), renderRss(site.sections[0]!, [], site.origin));
  await rejects(verifyOutput(root, site), /RSS-feed nyheder\/rss\.xml afviger/);
});
