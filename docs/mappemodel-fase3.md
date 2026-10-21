# Mappemodellen — fase 3: nyheder fra Google Sheets

Ét regneark i `nyheder/`, én række pr. nyhed med selve teksten i arket. Rækkerne gemmes som JSON i `content/nyheder/`. Udløbne nyheder filtreres fra ved build, ikke ved synkronisering.

## Mål

`bun run sync` læser nyhedsarket. Rækker med status `offentlig` bliver til `content/nyheder/<id>.json`. Andre rækker kommer hverken i `content/` eller på sitet. Sitet viser nyheder på `/nyheder/` og `/nyheder/<slug>/`, sorteret efter dato. Nyheder med en dato i fremtiden eller en overskredet udløbsdato bygges ikke.

## Arkets format

Første række er overskrifter. Rækkefølgen af kolonner er fri, og store og små bogstaver er ligegyldige.

| Kolonne | Regel |
|---|---|
| **ID** | Påkrævet, 3–64 tegn (`a-z`, `A-Z`, `0-9`, `-`, `_`). Udfyldes automatisk af Apps Script (se nedenfor). Rækkenummeret bruges aldrig |
| **Dato** | Påkrævet. Datocelle eller tekst som `2026-10-21`, `21-10-2026`, `21.10.2026` eller `21/10/2026`. Ligger datoen i fremtiden, vises nyheden fra den dag |
| **Titel** | Påkrævet |
| **Tekst** | Påkrævet. En tom linje starter et nyt afsnit, og et enkelt linjeskift giver et linjeskift. Links i cellen og nøgne `https://`-adresser bliver links. Andet formatering ignoreres |
| **Udløber** | Valgfri dato, inklusiv. Nyheden vises til og med denne dag (dansk tid) og forsvinder ved første build dagen efter |
| **Status** | `offentlig` publiceres. `kladde` og tom publiceres ikke. Alt andet publiceres ikke og giver en advarsel |

**Adresse:** Slug dannes første gang af dato og titel, fx `/nyheder/2026-10-21-generalforsamling/`. Ens titler fra forskellige år kolliderer derfor ikke. Som for alle andre sider bevares slug'et senere.

## ID'er: Apps Script med simpel `onEdit`

Kilden ligger i `scripts/apps-script/nyheder-id.gs`. Scriptet indsættes i arket under *Udvidelser → Apps Script*. Når en række får en titel og ID-cellen er tom, skriver det et ID som `n-3f9a2c41d0`. Valget er begrundet i fase 0, afsnit 5: Redaktøren skal ikke gøre noget, og synkroniseringen forbliver ren læseadgang. En simpel trigger kræver hverken installation eller godkendelse.

Svigter scriptet, publiceres en række uden ID ikke, og den står som fejl i rapporten.

## Filer

| Fil | Ændring |
|---|---|
| `lib/google/sheets.ts` | Ny: rå `spreadsheets.get` (grid data) → celler med tekst, tal og links |
| `lib/sync/news.ts` | Ny: overskrifter, rækker, status, datoer, tekst → afsnit → Markdown via serializeren fra fase 2b |
| `lib/sync/content.ts` | Nyt skema for nyheder i `content/nyheder/<id>.json` |
| `lib/sync/drive.ts`, `lib/google/client.ts` | `readSheet(fileId)` via Sheets API (GET, `drive.readonly` er nok) |
| `lib/sync/sync.ts` | Nyhedssektioner: ét ark, rækker bliver poster i det fælles flow (slugs, sidste gyldige version, masseudtagning) |
| `lib/site/load.ts`, `lib/site/sections.ts`, `src/content.config.ts`, `src/pages/**`, `src/components/Entries.astro` | Nyheder som sider med dato. Filtrering på dato og udløb ud fra `BUILD_AT` eller nu, dansk tid |
| `scripts/build.ts` | Sætter `BUILD_AT`, så build-scriptet og Astro filtrerer på samme tidspunkt |
| `scripts/apps-script/nyheder-id.gs` | Ny: Apps Script-kilden |
| `tests/sync-news.test.ts`, `tests/site.test.ts`, `tests/build.test.ts`, `tests/drive-client.test.ts`, `tests/helpers/fake-drive.ts` | Tests |

## Testkriterier

1. `kladde`, tom og ukendt status publiceres ikke og når ikke `content/`. Ukendt status giver en advarsel.
2. Udløbne nyheder kommer ikke med i build. Udløbsdatoen er inklusiv og regnes i dansk tid. Fremtidige nyheder kommer heller ikke med.
3. Rækkernes rækkefølge påvirker ikke ID'er eller output.
4. Manglende eller dubleret ID, ugyldig dato og en udløbsdato før datoen giver fejl for de pågældende rækker. En tidligere version beholdes, og resten synkroniseres.
5. Manglende overskrift, et ark der ikke kan læses, eller flere ark giver en fejl, og alle eksisterende nyheder beholdes.
6. Ændres status fra `offentlig` til `kladde`, fjernes nyheden.
7. Andre filer i `nyheder/` giver advarsler.
8. Links fra cellen og nøgne URL'er bliver links. Kun http(s) er tilladt.
9. Hele suiten, typekontrollen og et rigtigt build består.

## Risici

- **Der findes intet nyhedsark endnu.** `nyheder/` indeholder i dag to Google Docs. En live-kørsel giver derfor to advarsler og ingen nyheder, indtil arket er oprettet. Det kræver en ændring i Drive og dermed godkendelse.
- **Apps Script lægges ikke ind i Drive af mig.** Det gør redaktøren eller brugeren efter vejledningen.
- **Simple triggere reagerer ikke på ændringer fra API eller andre scripts.** Kopieres en række ind med eksisterende ID, kan der opstå dubletter. Begge dele fanges som fejl i rapporten.
- **Udløb kræver et build.** En udløbet nyhed ligger på en allerede uploadet side, indtil næste build og upload (natlig kørsel, fase 4).

## Resultat 21. oktober 2026

- **Tests:** 80 består, heraf 13 nye:
  - 9 i `tests/sync-news.test.ts`: status, rækkefølge, rækkefejl, fejl i arket, fjernelse, masseudtagning, datoer, links og kolonner.
  - 1 i `tests/site.test.ts`: udløb omkring midnat i dansk tid og fremtidige nyheder.
  - 2 i `tests/apps-script.test.ts`: den rigtige `.gs`-kilde køres mod et ark i hukommelsen.
  - 1 i `tests/drive-client.test.ts`: `readSheet`.

  Integrationstesten bygger nu også en aktiv, en udløbet, en fremtidig og en kladde-nyhed. Kun den aktive kommer i `dist`, og kladden når ikke `content/`. Typekontrollen giver 0 fejl, advarsler og hints.
- **Rigtigt build:** består outputkontrollen med 3 sider. Der er endnu ingen nyheder.
- **Live-kørsel kl. 20:46 UTC:**
  - 3 uændrede filer og ingen ændringer i `content/`.
  - 3 forventede advarsler: "nyhed 1" og "nyhed 2" er Google Docs, og der ligger intet nyhedsark.
  - Den kendte fejl for `fase1-test`.
  - Sheets-kaldet er endnu ikke afprøvet live, fordi arket mangler.
- **Live med nyhedsark kl. 20:47 UTC:** Med brugerens godkendelse er regnearket "Nyheder" (`1P_5fWSd…`) oprettet i `nyheder/` ved upload af en CSV. Det har overskriftsrækken og to testnyheder med udfyldte ID'er (`n-test00001`, `n-test00002`). Apps Script'et er ikke lagt ind i arket.
  - Drive gjorde datoerne til datoceller. Sheets API returnerer serienummeret 46316 sammen med teksten "2026-10-21", og begge giver samme dato.
  - Sync gav 2 nye nyheder og 3 uændrede filer. De 2 advarsler gjaldt de to Google Docs i `nyheder/`, og den eneste fejl var den kendte for `fase1-test`.
  - Buildet gav 5 sider, og outputkontrollen bestod. `/nyheder/2026-10-21-testnyhed-velkommen-til-den-nye-hjemmeside/` viser dato, to afsnit og et klikbart link. Testnyheden med udløb forsvinder ved første build efter 31. oktober 2026.
- **Afvigelser:**
  - `report.skippedSections` er nu altid tom, fordi alle sektionstyper synkroniseres. Feltet bevares, til en ny sektionstype kommer.
  - Kolonnenavne sammenlignes uden hensyn til store og små bogstaver, og status `Offentlig` accepteres derfor også.
  - Drive-ID'er kontrolleres stadig i output, men nyheds-ID'er gør ikke. De er ikke hemmelige og står i arket.
