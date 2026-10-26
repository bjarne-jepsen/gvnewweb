import { expect, test } from 'bun:test';
import { htaccess } from '../lib/site/htaccess';
import { siteConfigSchema } from '../lib/sync/config';

test('.htaccess: 301 for hvert redirect, punktummer escapes, og noindex for hele sitet', () => {
  const text = htaccess({ redirects: [{ from: '/side.php/', to: '/bo-her/' }, { from: '/a-b/c_d~e/', to: '/foreningen/kontakt/' }] });
  expect(text.split('\n')).toEqual([
    '# Skrevet af buildet (lib/site/htaccess.ts). Ret ikke i hånden.',
    '<IfModule mod_headers.c>',
    '  Header set X-Robots-Tag "noindex, nofollow"',
    '</IfModule>',
    'RedirectMatch 301 "^/side\\.php/?$" "/bo-her/"',
    'RedirectMatch 301 "^/a-b/c_d~e/?$" "/foreningen/kontakt/"',
    '',
  ]);
});
test('siteUrl skal være https uden sti; standard er example.invalid', () => {
  const base = { rootFolderId: 'root', sections: { nyheder: { type: 'notice', source: 'sheet' } } };
  expect(siteConfigSchema.parse(base).siteUrl).toBe('https://example.invalid');
  expect(siteConfigSchema.parse({ ...base, siteUrl: 'https://newweb.groendalsvaenge.dk' }).siteUrl).toBe('https://newweb.groendalsvaenge.dk');
  for (const siteUrl of ['http://newweb.groendalsvaenge.dk', 'https://example.com/sti/', 'https://example.com/?q=1'])
    expect(() => siteConfigSchema.parse({ ...base, siteUrl })).toThrow();
});
