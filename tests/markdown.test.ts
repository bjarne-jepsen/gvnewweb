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
