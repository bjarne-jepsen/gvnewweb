import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

// Runs the real Apps Script source against a small in-memory sheet.
const source = await readFile('scripts/apps-script/nyheder-id.gs', 'utf8');
function sheet(rows: string[][], index = 1) {
  const range = (row: number, column: number, height = 1, width = 1) => ({
    getRow: () => row, getLastRow: () => row + height - 1, getSheet: () => api,
    getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[column - 1 + c] ?? '')),
    setValues: (values: string[][]) => values.forEach((v, r) => v.forEach((cell, c) => { (rows[row - 1 + r] ??= [])[column - 1 + c] = cell; })),
  });
  const api = { getIndex: () => index, getLastColumn: () => Math.max(...rows.map(r => r.length)), getRange: range };
  return { rows, edit: (row: number, height = 1) => run({ range: range(row, 1, height, rows[0]!.length) }) };
}
let uuid = 0;
const run = (e: unknown) => new Function('e', 'Utilities', `${source}\nonEdit(e);`)(e, { getUuid: () => `0000000${++uuid}-aaaa-bbbb-cccc-dddddddddddd` });

test('udfylder kun tomme ID-celler i rækker med titel og ændrer aldrig et ID', () => {
  const s = sheet([['Status', 'Titel', 'ID'], ['kladde', 'Ny nyhed', ''], ['', '', ''], ['offentlig', 'Har ID', 'n-fast']]);
  s.edit(1, 4);
  expect(s.rows.map(r => r[2])).toEqual(['ID', 'n-00000001aa', '', 'n-fast']);
  s.edit(2); expect(s.rows[1]![2]).toBe('n-00000001aa');
});
test('rører hverken overskriftsrækken, andre ark eller ark uden ID-kolonne', () => {
  const header = sheet([['ID', 'Titel'], ['', 'x']]); header.edit(1, 1); expect(header.rows[1]![0]).toBe('');
  const other = sheet([['ID', 'Titel'], ['', 'x']], 2); other.edit(2); expect(other.rows[1]![0]).toBe('');
  const noId = sheet([['Titel', 'Tekst'], ['x', 'y']]); noId.edit(2); expect(noId.rows[1]).toEqual(['x', 'y']);
});
