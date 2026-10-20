import { expect, test } from 'bun:test';
import { renderMarkdown } from '../lib/site/markdown';
test('Markdown renderes uden HTML- eller protokolinjektion', () => {
  const html = renderMarkdown('## Overskrift\n\n- Et punkt\n- [Sikkert](https://example.test/)\n\n<script>alert(1)</script> [x](javascript:alert)');
  expect(html).toContain('<h2>Overskrift</h2>');
  expect(html).toContain('<ul>');
  expect(html).toContain('href="https://example.test/"');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
});

test('strukturerede blokke escaper tekst, alt og attributter', async () => {
  const { renderBlocks } = await import('../lib/site/blocks');
  expect(renderBlocks([{type:'paragraph',content:[{text:'<script>alert(1)</script>',href:'https://example.test/?a=1&b=2',bold:true}]}])).not.toContain('<script>');
  expect(() => renderBlocks([{type:'paragraph',content:[{text:'x',href:'javascript:alert(1)'}]}])).toThrow();
});
