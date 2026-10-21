/**
 * Grøndalsvænge — nyhedsarket: udfylder ID for nye nyheder.
 *
 * Indsættes i nyhedsarket via Udvidelser → Apps Script (erstat indholdet af Kode.gs og gem).
 * Det er en simpel trigger: den kræver hverken installation, godkendelse eller en bestemt ejer
 * og kører som den redaktør, der redigerer.
 *
 * Scriptet skriver kun i ID-kolonnen, kun i tomme celler og kun i rækker, der har en titel.
 * Et ID ændres aldrig. Hjemmesidens synkronisering har kun læseadgang; mangler et ID,
 * publiceres rækken ikke, og den står som fejl i rapporten.
 *
 * Kilden vedligeholdes i Git: scripts/apps-script/nyheder-id.gs
 */
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getIndex() !== 1) return; // hjemmesiden læser kun det første ark
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return;
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var idColumn = header.indexOf('id') + 1, titleColumn = header.indexOf('titel') + 1;
  if (!idColumn || !titleColumn) return;
  var first = Math.max(2, e.range.getRow()), last = e.range.getLastRow();
  if (last < first) return;
  var ids = sheet.getRange(first, idColumn, last - first + 1, 1).getValues();
  var titles = sheet.getRange(first, titleColumn, last - first + 1, 1).getValues();
  var changed = false;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === '' && String(titles[i][0]).trim() !== '') {
      ids[i][0] = 'n-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      changed = true;
    }
  }
  if (changed) sheet.getRange(first, idColumn, ids.length, 1).setValues(ids);
}
