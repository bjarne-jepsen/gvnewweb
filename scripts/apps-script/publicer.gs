/**
 * Grøndalsvænge — knappen "Hjemmeside → Publicér nu".
 *
 * Indsættes i et ark i mappen redaktion/, som KUN admin kan redigere (Udvidelser → Apps Script,
 * erstat indholdet af Kode.gs og gem). Alle, der kan redigere arket, kan læse tokenet nedenfor.
 *
 * Under Projektindstillinger → Script-egenskaber:
 *   GITHUB_REPO     fx bjarne-jepsen/gvnewweb
 *   GITHUB_TOKEN    fine-grained token, kun til dette repository, med "Contents: Read and write"
 *   ALLOWED_EMAILS  de adresser, der må publicere, adskilt af komma
 *
 * Menuen beder kun GitHub om at starte workflowet "Publicér" (.github/workflows/publish.yml).
 * Indholdet hentes stadig fra Drive af workflowet med en servicekonto, der kun kan læse.
 *
 * Kilden vedligeholdes i Git: scripts/apps-script/publicer.gs
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Hjemmeside').addItem('Publicér nu', 'publish').addToUi();
}

function publish() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  // Tom, hvis Google ikke vil oplyse adressen (fx en konto uden for foreningen): så afvises kaldet.
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var allowed = String(props.getProperty('ALLOWED_EMAILS') || '').split(',')
    .map(function (a) { return a.trim().toLowerCase(); }).filter(function (a) { return a; });
  if (!email || allowed.indexOf(email) < 0) {
    ui.alert('Du har ikke adgang til at publicere hjemmesiden.');
    return;
  }
  var repo = String(props.getProperty('GITHUB_REPO') || '');
  var token = String(props.getProperty('GITHUB_TOKEN') || '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) {
    ui.alert('Opsætningen mangler: GITHUB_REPO og GITHUB_TOKEN under Script-egenskaber.');
    return;
  }
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ event_type: 'publish', client_payload: { requested_by: email } }),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code === 204) ui.alert('Opdateringen er startet. Hjemmesiden er opdateret om 2–3 minutter.');
  else if (code === 401 || code === 403) ui.alert('GitHub afviste tokenet (HTTP ' + code + '). Det er måske udløbet og skal fornys.');
  else ui.alert('Opdateringen kunne ikke startes (HTTP ' + code + '). Prøv igen om lidt.');
}
