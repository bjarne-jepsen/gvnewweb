import { expect, test } from 'bun:test';
import { hostFiles } from '../lib/site/hosting';
import { siteConfigSchema } from '../lib/sync/config';

test('_redirects har 301 for hvert redirect med og uden skråstreg; _headers giver noindex overalt', () => {
  const files = hostFiles({ redirects: [{ from: '/side.php/', to: '/bo-her/' }, { from: '/a-b/c/', to: '/foreningen/kontakt/' }] });
  expect([...files.keys()]).toEqual(['_redirects', '_headers']);
  expect(files.get('_redirects')!.split('\n').slice(1)).toEqual([
    '/side.php /bo-her/ 301', '/side.php/ /bo-her/ 301',
    '/a-b/c /foreningen/kontakt/ 301', '/a-b/c/ /foreningen/kontakt/ 301', '']);
  expect(files.get('_headers')!.split('\n').slice(1)).toEqual(['/*', '  X-Robots-Tag: noindex, nofollow', '']);
});
test('siteUrl skal være https uden sti; standard er example.invalid', () => {
  const base = { rootFolderId: 'root' };
  expect(siteConfigSchema.parse(base).siteUrl).toBe('https://example.invalid');
  expect(siteConfigSchema.parse({ ...base, siteUrl: 'https://newweb.groendalsvaenge.dk' }).siteUrl).toBe('https://newweb.groendalsvaenge.dk');
  for (const siteUrl of ['http://newweb.groendalsvaenge.dk', 'https://example.com/sti/', 'https://example.com/?q=1'])
    expect(() => siteConfigSchema.parse({ ...base, siteUrl })).toThrow();
});
