import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { loadSite, manualRedirectsSchema } from '../lib/site/load';
import { siteConfigSchema } from '../lib/sync/config';
import { slugSchema } from '../lib/sync/slugs';

// The WordPress redirect list shipped in content/_redirects.json (phase 5c).
const config = siteConfigSchema.parse(JSON.parse(await readFile('config/site.json', 'utf8')));
const redirects = manualRedirectsSchema.parse(JSON.parse(await readFile('content/_redirects.json', 'utf8')));

test('alle mål er en sektion eller en side i en konfigureret sektion', () => {
  expect(Object.keys(redirects).length).toBe(48);
  for (const [from, to] of Object.entries(redirects)) {
    const [section, slug, ...rest] = to.split('/').filter(Boolean);
    expect(section! in config.sections).toBe(true);
    if (slug) expect(slugSchema.safeParse(slug).success).toBe(true);
    expect(rest).toEqual([]);
    expect(from.split('/')[1]! in config.sections).toBe(false); // an old path never shadows a section
  }
  expect(Object.keys(redirects)).toEqual(Object.keys(redirects).sort()); // kept sorted for review
});

test('hvert redirect er enten aktivt eller venter med en advarsel, til siden findes', async () => {
  // Independent of which pages content/ holds right now: every entry is accounted for exactly once.
  const site = await loadSite('.');
  const live = new Set([...site.sections.map(s => s.path), ...site.items.map(i => i.path)]);
  for (const [from, to] of Object.entries(redirects)) {
    const active = site.redirects.some(r => r.from === from && r.to === to);
    const waiting = site.warnings.includes(`_redirects.json: ${from} → ${to} springes over, fordi ${to} ikke findes`);
    expect([from, active, waiting]).toEqual([from, live.has(to), !live.has(to)]);
  }
  // Section targets always exist, so these work from day one.
  expect(site.redirects.map(r => `${r.from} → ${r.to}`)).toEqual(expect.arrayContaining(['/andelshaveren/ → /bo-her/', '/groendalsvaenge-socialt/ → /faellesskab/', '/internt-2/nyhedsarkiv/ → /nyheder/']));
});
