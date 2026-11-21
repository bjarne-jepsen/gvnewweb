import { describe, expect, test } from 'bun:test';
import { loadModels, MODELS, modelMarker, modelProblems } from '../lib/site/models';
import { renderBody } from '../lib/site/render';
import { blocksToMarkdown, summaryOf, type SerializableBlock } from '../lib/sync/markdown';

const p = (text: string): SerializableBlock => ({ type: 'paragraph', content: [{ text }] });
const known = (name: string) => name === 'hus-1918' ? { src: '/modeller/hus-1918.html', title: 'Titel "x"', caption: 'Tekst & mere' } : undefined;

describe('modelmarkør', () => {
  test('genkender kun et afsnit, der alene er markøren', () => {
    expect(modelMarker('[model: hus-1918]')).toBe('hus-1918');
    expect(modelMarker('  [Model:Hus-1918 ] ')).toBe('hus-1918');
    expect(modelMarker('Se [model: hus-1918]')).toBeUndefined();
    expect(modelMarker('[model: ../x]')).toBeUndefined();
    expect(modelMarker('[billede: hus-1918]')).toBeUndefined();
  });

  test('markøren fra Google Docs bliver en sandboxed iframe uden same-origin', () => {
    const md = blocksToMarkdown([p('Før'), p('[model: hus-1918]'), p('Efter')], () => '');
    const html = renderBody(md, () => false, u => u, undefined, known);
    expect(html).toBe('<p>Før</p>\n<figure class="model"><iframe src="/modeller/hus-1918.html" title="Titel &quot;x&quot;" sandbox="allow-scripts" loading="lazy" referrerpolicy="no-referrer"></iframe><figcaption>Tekst &amp; mere</figcaption></figure>\n<p>Efter</p>');
    expect(html).not.toContain('allow-same-origin');
  });

  test('en ukendt model eller markør inde i tekst forbliver almindelig tekst', () => {
    const md = blocksToMarkdown([p('[model: hus-1919]'), p('Se [model: hus-1918] her')], () => '');
    expect(renderBody(md, () => false, u => u, undefined, known)).toBe('<p>[model: hus-1919]</p>\n<p>Se [model: hus-1918] her</p>');
    // Without a model lookup (intros, news) the marker is just text.
    expect(renderBody(blocksToMarkdown([p('[model: hus-1918]')], () => ''), () => false, u => u)).toBe('<p>[model: hus-1918]</p>');
  });

  test('markøren bliver aldrig sidens resumé', () => {
    expect(summaryOf([p('[model: hus-1918]'), p('Første rigtige afsnit.')])).toBe('Første rigtige afsnit.');
  });
});

describe('modelfiler', () => {
  test('alle modeller i repoet består sikkerhedskontrollen', async () => {
    const assets = await loadModels();
    for (const name of Object.keys(MODELS)) for (const ext of ['html', 'css', 'js']) expect(assets.has(`/modeller/${name}.${ext}`)).toBe(true);
  });

  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:">`;
  const ok = { html: `${csp}<svg xmlns="http://www.w3.org/2000/svg"></svg><script src="m.js"></script>`, css: 'body { color: red; }', js: 'document.body.hidden = false;' };
  test('en ren model har ingen problemer', () => expect(modelProblems('m', ok)).toEqual([]));
  test.each([
    ['CDN-script', { ...ok, html: ok.html + '<script src="https://cdn.example/tw.js"></script>' }],
    ['inline script', { ...ok, html: ok.html.replace('<script src="m.js"></script>', '<script>alert(1)</script>') }],
    ['event-attribut', { ...ok, html: ok.html + '<button onclick="x()">' }],
    ['manglende CSP', { ...ok, html: ok.html.replace(csp, '') }],
    ['ekstern CSS', { ...ok, css: '@import url(https://fonts.example/a.css);' }],
    ['CSS-billede', { ...ok, css: 'body { background: url(/hemmelig.png); }' }],
    ['fetch', { ...ok, js: 'fetch("/api")' }],
    ['parent', { ...ok, js: 'parent.location = "x"' }],
    ['protokolløs adresse', { ...ok, js: 'img.src = "//evil.example/a.png"' }],
  ])('afviser %s', (_, files) => expect(modelProblems('m', files).length).toBeGreaterThan(0));
});
