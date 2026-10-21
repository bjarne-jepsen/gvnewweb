import { expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { googleDocsBlocks } from '../lib/google/docs';

const raw = JSON.parse(await readFile('tests/fixtures/google-document.json', 'utf8'));
const noImages = async () => { throw new Error('Billede mangler'); };

test('parseren giver strukturerede blokke og forskyder overskrifter ét niveau', async () => {
  const { bodyBlocks } = await googleDocsBlocks(structuredClone(raw), 'test-doc-id', noImages);
  expect(bodyBlocks).toEqual([
    { type: 'heading', level: 3, content: [{ text: 'Før du går i gang' }] },
    { type: 'paragraph', content: [{ text: 'Læs vejledningen og det tilhørende PDF-bilag.' }] },
    { type: 'list', items: [[{ text: 'Første punkt' }], [{ text: 'Andet punkt' }]] },
    // The paragraph terminator leaves an empty run; the Markdown serializer drops empty runs.
    { type: 'paragraph', content: [{ text: 'Læs mere', href: 'https://example.test/vejledning' }, { text: '' }] },
  ]);
  expect(JSON.stringify(bodyBlocks)).not.toMatch(/documentStyle|rgbColor|tabProperties/);
});

test.each(['inlineSuggestionsMode', 'suggestions', 'malformedTable', 'mergedCells', 'tabs', 'inlineObject', 'numberedList', 'nestedList', 'unsafeLink', 'headers', 'wrongId'])('Docs afviser ikke-understøttet indhold: %s', async kind => {
  const doc = structuredClone(raw); const tab = doc.tabs[0].documentTab;
  if (kind === 'inlineSuggestionsMode') doc.suggestionsViewMode = 'SUGGESTIONS_INLINE';
  if (kind === 'suggestions') tab.body.content[1].paragraph.elements[0].textRun.suggestedInsertionIds = ['suggestion-id'];
  if (kind === 'malformedTable') tab.body.content.push({ table: { rows: 1 } });
  if (kind === 'mergedCells') tab.body.content.push({ table: { tableRows: [{ tableCells: [{ tableCellStyle: { columnSpan: 2 }, content: [] }] }] } });
  if (kind === 'tabs') doc.tabs.push(structuredClone(doc.tabs[0]));
  if (kind === 'inlineObject') tab.body.content[1].paragraph.elements.push({ inlineObjectElement: { inlineObjectId: 'private-image' } });
  if (kind === 'numberedList') tab.lists['kix.1'].listProperties.nestingLevels[0].glyphType = 'DECIMAL';
  if (kind === 'nestedList') tab.body.content[3].paragraph.bullet.nestingLevel = 1;
  if (kind === 'unsafeLink') tab.body.content[5].paragraph.elements[0].textRun.textStyle.link.url = 'javascript:alert(1)';
  if (kind === 'headers') tab.headers = { private: { content: [] } };
  await rejects(googleDocsBlocks(doc, kind === 'wrongId' ? 'other-id' : 'test-doc-id', noImages));
});
