import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { externalReference, scriptProblem } from '../scripts/verify-output';
import { digest, guideFingerprint } from '../lib/sync/content';

const tokens = Object.fromEntries([...(await readFile('src/styles/tokens.css', 'utf8')).matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1]!, m[2]!]));
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

// The combinations docs/cvi.md allows. Text needs 4.5:1 (WCAG AA), focus rings 3:1.
const text = [
  ...['ink', 'green', 'muted'].flatMap(fg => ['paper', 'surface'].map(bg => [fg, bg])),
  ['ink', 'surface-hover'], ['paper', 'green'], ['paper', 'ink'], ['on-dark', 'dark'], ['on-dark-muted', 'dark'],
];
const focus = [['green', 'paper'], ['green', 'surface'], ['on-dark', 'dark']];

test.each(text)('CVI: tekst i %s på %s har mindst 4,5:1', (fg, bg) => {
  expect(contrast(tokens[`color-${fg}`]!, tokens[`color-${bg}`]!)).toBeGreaterThanOrEqual(4.5);
});
test.each(focus)('CVI: fokusring i %s på %s har mindst 3:1', (fg, bg) => {
  expect(contrast(tokens[`color-${fg}`]!, tokens[`color-${bg}`]!)).toBeGreaterThanOrEqual(3);
});

test('outputkontrol: eksterne ressourcer afvises, links og data-URI\'er tillades', () => {
  for (const [rel, text] of [
    ['index.html', '<link rel="stylesheet" href="https://cdn.example.com/x.css">'],
    ['index.html', '<link rel="preconnect" href="//fonts.example.com">'],
    ['index.html', '<img src=\'http://example.com/a.png\' alt="a">'],
    ['index.html', '<img src="/a.png" srcset="/a.png 1x, https://example.com/b.png 2x" alt="a">'],
    ['index.html', '<p style="background:url(https://example.com/a.png)">x</p>'],
    ['index.html', '<style>@import "x.css";</style>'],
    ['_astro/a.css', '@font-face{src:url("https://fonts.example.com/a.woff2")}'],
    ['_astro/a.css', '@import url(/local.css);'],
  ]) expect(externalReference(rel!, text!)).toBeDefined();
  for (const [rel, text] of [
    ['index.html', '<a href="https://www.facebook.com/groups/x" rel="noreferrer">Facebook</a><a href="mailto:a@example.com">a</a>'],
    ['index.html', '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E"><link rel="stylesheet" href="/_astro/a.css">'],
    ['index.html', '<img src="/bo-her/side/abc.png" alt="Et kort">'],
    ['_astro/a.css', '.a{background:url(data:image/svg+xml,x)}.b{color:red}'],
    ['sitemap.xml', '<loc>https://example.invalid/</loc>'],
  ]) expect(externalReference(rel!, text!)).toBeUndefined();
});

test('outputkontrol: kun eksterne moduler fra /_astro/, ingen inline-scripts eller event-attributter', () => {
  expect(scriptProblem('<p>Ingen scripts</p>')).toBeUndefined();
  expect(scriptProblem('<script type="module" src="/_astro/Search.astro_astro_type_script_index_0_lang.CE37oxSV.js"></script>')).toBeUndefined();
  for (const bad of ['<script>alert(1)</script>', '<script type="module">x()</script>', '<script src="https://cdn.test/x.js"></script>',
    '<script type="module" src="/andet/x.js"></script>', '<script type="module" src="/_astro/x.js">y()</script>', '<img src="x.png" onerror="alert(1)">', '<SCRIPT>x</SCRIPT>', '<script'])
    expect(scriptProblem(bad)).toBeDefined();
});

test('fingeraftryk: sider uden søgeord har samme aftryk som før, søgeord tæller med', () => {
  expect(guideFingerprint('Brødtekst\n')).toBe(digest('Brødtekst\n'));
  expect(guideFingerprint('Brødtekst\n', [])).toBe(digest('Brødtekst\n'));
  expect(guideFingerprint('Brødtekst\n', ['a'])).not.toBe(guideFingerprint('Brødtekst\n', ['b']));
});
