# Mappemodellen — fase 1: afprøvning af Markdown-eksporten

**Status 21. oktober 2026: afsluttet. Docs API'et er bekræftet live (afsnit 3).** Pilotvejledningen, de øvrige kildefiler i fællesdrevet og et testdokument med lister, tabeller, billede, faner og uaccepterede forslag er afprøvet.

**Konklusion:** Drive-eksporten til Markdown **tager uaccepterede forslag med**. Den kan derfor ikke bruges, når redaktører arbejder i forslagstilstand. Anbefalingen er Docs API med `PREVIEW_WITHOUT_SUGGESTIONS` → den eksisterende parser → en egen Markdown-serializer (afsnit 4).

Anbefalingen nedenfor er foreløbig og kan ændre sig, når forslagstesten er kørt.

## 1. Metode

- **Kilde:** pilotvejledningen "fælleslokaler-hvem-skal-betale" (`1T1POrjb…`) i den nuværende version med XXX, `modifiedTime` 2026-10-20T15:31:12Z. Det er samme version som det godkendte snapshot `sha256:4ab5312f…`.
- **Eksport:** `files.export` med `text/markdown` via Google Drive-connectoren i Claude Code. Connectoren kører som brugerens egen konto, der har redigeringsadgang.
- **Sammenligning:** Eksporten er fortolket med `mdast-util-from-markdown` og GFM-tabeller, dvs. samme slags parser, som Astro bruger. Resultatet er sammenlignet med den eksisterende parsers bodyBlocks fra snapshottet.
- **Opbevaring:** Rådata ligger i `.local/fase1/` uden for Git. Den indlejrede billeddata er skåret fra i den lokale kopi.

## 2. Resultater for pilotvejledningen

**Teksten er bevaret.** Ordsammenligningen viser samme ord i begge metoder. De eneste forskelle skyldes tokenisering omkring fed tekst og titlen.

**Strukturen mister væsentlige dele:**

| Element | Eksisterende parser | Drive-eksport | Konsekvens |
|---|---|---|---|
| Skillelinjer efter et afsnit | 5 `separator` | `tekst  \n---` | **4 af 5 afsnit bliver til H2-overskrifter** (setext-overskrift i CommonMark). Kun én skillelinje overlever. Resultatet er forkert og kan ikke ses i Markdown-kilden |
| Dokumenttitel | Filnavn som titel. Titel-afsnittet bliver H2 | `# **…**` (H1) plus en **tom H1** (`# `) | Dobbelt H1 sammen med sidens egen titel. Tom overskrift |
| Overskrifter | Ren tekst | `## **…**`, foranstillede mellemrum | Fed tekst indlejret i overskrifter skal fjernes |
| Celler med flere afsnit (10 af 22) | Bevaret som separate afsnit | Samlet på én linje med mellemrum, fx "Weekender og døgn Private fester" | Afsnitsgrænser i cellerne går tabt |
| Første tabelrække | `td` | Gøres altid til **tabeloverskrift** (`th`) | Alle 8 tabeller har kun én række, så alt indhold bliver overskrifter. Det er semantisk forkert |
| Blødt linjeskift i celle | `\n` | Rå vertikal tabulator (U+000B) | Usynligt styretegn i HTML |
| Billede | PNG 1450×452, 97 KB (originalen) | Reference-stil `![][image1]` med data-URI sidst i filen. **Nedskaleret til 643×200** | Lavere opløsning end originalen. Billedet kan trækkes ud, men det er ikke originalfilen |
| Alt-tekst | Mangler i dokumentet. Blev sat via pilotindekset | `![]` (tom) | Som forventet. Sætter redaktøren alt-tekst i Docs, skal eksporten afprøves igen |
| Escapes | – | `1\.`, `\+7.250`, `2026\.` | Uskadeligt; fortolkes korrekt |

**Konklusion for pilotvejledningen:** Eksporten taber ingen tekst, men giver forkert struktur på tre punkter, der ikke kan opdages i den færdige Markdown uden at sammenligne med kilden: falske overskrifter, sammenklappede celler og tabelrækker gjort til overskrifter. En validering af tilladte elementer ville godkende resultatet, fordi alle noderne er tilladte typer.

## 3. Forslag

### Resultat for Drive-eksporten

Brugeren lavede tre uaccepterede forslag i `fase1-test` med redigeringsadgang (admin@groendalsvaenge.dk). Den tredje eksport (`.local/fase1/test-export-3.md`) er sammenlignet med den anden:

| Forslag | Forventet, hvis forslag udelades | Drive-eksporten |
|---|---|---|
| Indsæt `FORSLAGINDSAT` | Mangler | **Med**, som eget afsnit |
| Slet "Slut på testdokumentet." | Står der stadig | Står der stadig |
| Gør "Første punkt" fed | Ikke fed | **Fed** (`**Første punkt**`) |

Eksporten svarer dermed til visningen med forslag inline: Foreslået tekst og formatering kommer med, og foreslåede sletninger er ikke udført. Resultatet er hverken den godkendte tekst eller en entydigt markeret kladde. Connectorens tekstvisning (`read_file_content`) gør det samme.

Forbehold: Uden Docs API'ets JSON kan jeg ikke selv se, at ændringerne er registreret som forslag. Det bygger på brugerens beskrivelse. At sletningen ikke er udført, tyder på, at forslagstilstand var slået til. Med en konto, der kun har læseadgang, er eksporten ikke afprøvet. Selv hvis den udelader forslag, ville sikkerheden afhænge af kontoens rolle, og det er for skrøbeligt.

Samme sammenligning viste også, at **typografien "Titel" eksporteres som H1** (`# **Tekst i fane 2**`). Den var sat på teksten i fane 2.

### Docs API (bekræftet live 21. oktober 2026)

`documents.get` blev kaldt på `fase1-test` med `includeTabsContent=true` og et kortlivet token for admin-kontoen med `documents.readonly`. Rå svar ligger i `.local/fase1/docs-api-*.json`.

| | `SUGGESTIONS_INLINE` | `PREVIEW_WITHOUT_SUGGESTIONS` |
|---|---|---|
| `suggested*`-felter | 7 | **0** |
| `FORSLAGINDSAT` | Med (`suggestedInsertionIds`) | **Mangler** |
| "Slut på testdokumentet." | Med (`suggestedDeletionIds`) | Med |
| "Første punkt" | `suggestedTextStyleChanges`, grundtekst ikke fed | **Ikke fed** |

Det bekræfter to ting:

1. Alle tre ændringer er registreret som rigtige forslag. Resultatet for Drive-eksporten ovenfor står derfor fast.
2. `PREVIEW_WITHOUT_SUGGESTIONS` giver netop den accepterede tekst uden spor af forslag. Begge visninger returnerede to faner.

Drive-eksporten har ingen parameter, der svarer til `PREVIEW_WITHOUT_SUGGESTIONS`.

Oprindelig testplan:

1. Eksportér som Markdown via connectoren, med redigeringsadgang.
2. Gentag, hvis muligt, med en konto der kun har læseadgang. Det kræver, at dokumentet deles med en konto med læseadgang, som vi kan hente med.
3. Hent med Docs API `PREVIEW_WITHOUT_SUGGESTIONS` via REST-klienten. **Det kræver et kortlivet lokalt token** (`GOOGLE_ACCESS_TOKEN_FILE`). Connectoren udstiller ikke `documents.get`.
4. Kontrollér for hver metode: Kommer foreslået indsat tekst med? Forsvinder foreslået slettet tekst? Er formateringsforslag ignoreret?

## 4. Anbefaling: kombination

**Docs API (`PREVIEW_WITHOUT_SUGGESTIONS`) → den eksisterende parser → en egen, deterministisk Markdown-serializer.**

- Parseren bevarer allerede den rigtige struktur: skillelinjer, celler med flere afsnit, tabeller uden overskriftsrække, billeder i original opløsning og eksplicit håndtering af forslag. Den er testet med 43 tests.
- Serializeren skriver kun de konstruktioner, vi tillader, og escaper selv. Skillelinjer får altid en tom linje før sig, så de ikke kan blive til setext-overskrifter. Celler med flere afsnit skrives på en entydig måde, der skal fastlægges i fase 2. Planen forbyder rå HTML, så `<br>` er udelukket. Blandt mulighederne er en tabel med én række omsat til afsnit med fed celletekst.
- Markdown'en i Git bliver læsbar og forudsigelig. Det samme allowlist-tjek bruges ved build, som foreslået i fase 0.
- Drive-eksporten kan bruges senere til et grovtjek af, at parseren ikke mister tekst: ordsammenligningen i afsnit 2 kan køres automatisk. Den er ikke nødvendig for at komme i gang.

Forslagstesten (afsnit 3) gør det afgørende: Drive-eksporten tager uaccepterede forslag med og kan derfor ikke bruges som kilde. Den kan stadig bruges som det grovtjek af tekst, der er nævnt ovenfor, men kun i dokumenter uden forslag. At `PREVIEW_WITHOUT_SUGGESTIONS` udelader de tre forslag, er bekræftet live (afsnit 3). Parserens eksisterende forslagstjek gøres samtidig til en sikkerhedsregel: findes der `suggested*`-felter i svaret, afvises dokumentet, og det beholder sin sidste gyldige version.

## 5. De øvrige kildefiler (admin@groendalsvaenge.dk)

Connectoren er skiftet til admin@groendalsvaenge.dk. Fundene herfra:

- **"Grøndalsvænge hjemmeside" er et fællesdrev**, ikke en mappe. Rod-ID'et er `0AIbhvNO…`. Sektionsmapperne `dokumenter`, `foreningen`, `kalender`, `nyheder`, `redaktion` og `vejledninger` ligger direkte i roden. Det passer med anbefalingen i fund 5 i fase 0. `rootFolderId` i konfigurationen er dermed fællesdrevets ID, og alle kald kræver `supportsAllDrives`, `includeItemsFromAllDrives`, `corpora=drive` og `driveId`.
- **Listningen er pagineret selv ved seks mapper.** Rodlisten kom i to sider, og `dokumenter` stod først på side 2. Det bekræfter fund 3 i fase 0: en sync, der kun læser første side, ville "fjerne" hele sektionen.
- **Indhold i dag:** `foreningen` og `vejledninger` har hver ét Google Docs-dokument, `dokumenter` har én PDF, og `nyheder` har **to Google Docs ("nyhed 1", "nyhed 2") og intet regneark**. Med den nye model giver `nyheder` derfor to advarsler om forkert filtype og ingen nyheder, indtil arket er oprettet. Der er ingen genveje endnu.
- **De tre Docs er testsætninger på én linje**, fx "dette er et testdokument i området VEJLEDNING". Eksporten er korrekt, men én fil slutter med et hårdt linjeskift (`  \n`). Den indeholder ingen lister, faner, tabeller, links eller billeder, så den bidrager ikke til strukturafprøvningen.
- **Admin-kontoen kan ikke læse pilotvejledningen.** Pilotvejledningen ligger i bjepsen@gmail.com's Drive og svarer "not found" for admin. Det er præcis scenariet med en genvej til en fil uden adgang: en genvej fra `vejledninger` til pilotvejledningen ville give fejlen "manglende adgang" i rapporten.

## 6. Mangler

Der findes ikke et rigtigt dokument med de strukturer, der skal afprøves. Jeg foreslår ét testdokument i fællesdrevet, fx `vejledninger/fase1-test`, med:

1. Titel-afsnit plus overskrift 1, 2 og 3
2. Et afsnit efterfulgt direkte af en vandret linje (setext-fejlen)
3. Punktliste, nummereret liste og en liste med et indrykket niveau
4. Et link, fed og kursiv i samme afsnit
5. En tabel med 2×3 celler, hvor én celle har to afsnit, og én tabel med flettede celler
6. Et billede **med** alt-tekst, sat via højreklik → Alternativ tekst
7. En ekstra fane
8. Uaccepterede forslag: én indsættelse, én sletning og én formateringsændring

Det kan være det samme dokument som forslagstesten. Afprøvningen gennem Docs API (`PREVIEW_WITHOUT_SUGGESTIONS`) kræver stadig et kortlivet lokalt token, som beskrevet i afsnit 3.

## 7. Testdokumentet `vejledninger/fase1-test`

Dokumentet blev oprettet 21. oktober 2026 af admin-kontoen efter brugerens godkendelse (ID `17DuJ0QD…`). Sessionen har kun Drive-connectoren og ingen Docs-editor, så dokumentet er lavet ved at uploade HTML, som Drive har konverteret. Punkt 1–6 er med. Punkt 7 (en ekstra fane) og titeltypografien på første afsnit kan ikke laves ad den vej. Brugeren tilføjer dem sammen med forslagene.

Forbehold: Nogle af de resultater, der er markeret ¹, kan stamme fra HTML-konverteringen og ikke fra eksporten. Det kan først afgøres med Docs API'ets JSON.

| Punkt | Resultat i Drive-eksporten |
|---|---|
| Afsnit + vandret linje | **Bekræftet:** `tekst  \n---`, og afsnittet bliver til en H2 |
| Overskrifter | `# **…**`; niveauerne 1–3 er bevaret |
| Punktliste, nummereret liste | Korrekte lister, men **pakket ind i blockquote** (`> * …`)¹ |
| Indrykket liste | Underpunkterne mangler `>`, så **listen deles i tre**: blockquote, løs liste, blockquote. Hierarkiet går tabt¹ |
| Fed, kursiv, link | Korrekt |
| Celle med to afsnit | **Bekræftet:** samlet til ét afsnit ("Første afsnit i cellen Andet afsnit i cellen") |
| Flettede celler | **Flettet indhold eksporteres som tomme celler uden markering.** Det kan ikke skelnes fra en tabel, der rigtigt har tomme celler, så en validering kan ikke opdage og afvise det. Parseren afviser flettede celler i dag |
| Billede med alt-tekst | Alt-teksten er bevaret. Billedet er genkodet (378 → 490 bytes), samme størrelse i pixel |
| Billede mellem afsnit | Samlet med afsnittene før og efter i ét afsnit med hårde linjeskift¹ |

**Konsekvens for anbefalingen:** Testen styrker anbefalingen om en kombination (afsnit 4). Flettede celler og indrykkede lister giver forkert struktur, som ikke kan opdages i Markdown'en. Den eksisterende parser afviser begge eksplicit i dag.

### Anden eksport efter brugerens ændringer

Brugeren har tilføjet en ekstra fane. Det er uafklaret, om titeltypografien blev sat, og forslagene var endnu ikke lavet. Derefter er dokumentet eksporteret igen (`.local/fase1/test-export-2.md`) og sammenlignet linje for linje med første eksport. **De eneste forskelle skyldes fanerne:**

- **Alle faner kommer med.** Hver fane får sit navn som H1 (`# **Fane 1**`, `# **Fane 2**`), og fane 2's tekst står til sidst. Det har to konsekvenser:
  1. Indhold i en ekstra fane, fx interne noter, ville blive publiceret uden advarsel.
  2. Når en anden fane tilføjes, får hele dokumentet en ekstra H1-overskrift øverst ("Fane 1"). Strukturen ændrer sig altså, selvom første fane er uændret.

  Den eksisterende parser afviser dokumenter med mere end én fane. Det skal bevares.
- **Forslag:** Der var endnu ingen forslag i dokumentet, så denne eksport siger intet om dem.
- **Titeltypografien giver ingen forskel.** Første afsnit eksporteres stadig som et almindeligt afsnit. Enten blev typografien ikke anvendt, eller også eksporterer Drive "Titel" som almindelig tekst. I pilotvejledningen blev titlen til `# **…**`, så det er ikke afklaret.

### Tredje eksport efter forslagene

Se afsnit 3. Forslagene kommer med i eksporten. Typografien "Titel" bliver til H1.
