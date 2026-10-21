# Mappemodellen — fase 0: gennemgang og plan

Skrevet 21. oktober 2026 som svar på `plan-mappemodel.md`. Der er ikke ændret applikationskode. Udgangspunkt: commit `8458a27`. 43 tests består, typekontrollen har 0 fejl, advarsler og hints. Astro 6.4.8, Zod 4.6.7 og Bun 1.3.11.

## 1. Væsentlige fund

Fundene er sorteret efter betydning for korrekthed.

1. **Forslag håndteres modsat af det, planen kræver.** Klienten henter Docs med `SUGGESTIONS_INLINE`, og parseren afviser hele dokumentet, hvis der findes forslag (`lib/adapters/google/blocks.ts`). I mappemodellen skal redaktører kunne bruge forslagstilstand. Forslag må derfor ikke stoppe synkroniseringen, men skal udelades. Den kendte, sikre vej er `documents.get` med `suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS`. Det eksisterende forslagstjek beholdes som ekstra sikring: svaret må ikke indeholde `suggested*`-felter. Om Drive-eksporten til Markdown medtager forslag, vides ikke. Svaret kan også afhænge af kontoens rolle, fordi en læser normalt ikke ser forslag. Fase 1 skal derfor afprøve med samme rolle som den kommende synkroniseringskonto. Connectoren i denne session kører som brugerens egen konto, der har redigeringsadgang.

2. **GFM-Markdown kan ikke rumme pilotens tabeller uden tab.** Pilotvejledningen har otte tabeller med 22 celler. 10 af cellerne indeholder flere afsnit. En GFM-tabelcelle kan kun rumme én linje, medmindre man bruger `<br>`, og rå HTML er forbudt. Alle otte tabeller har kun én række (1×2 eller 1×3) og bruges sandsynligvis som layout-bokse. Mulige løsninger: (a) afsnit i en celle samles med et fast skilletegn, (b) en tabel med én række omsættes til almindelige afsnit med en underoverskrift pr. celle, eller (c) dokumentet afvises. Det afgøres i fase 1 ud fra eksporten og de rigtige dokumenter.

3. **En fejlet eller ufuldstændig mappelistning må aldrig læses som "alt er fjernet".** Når fjernelse udløser sletning, kan en API-fejl, en manglende side i pagineringen eller en tilbagetrukket mappedeling tømme hjemmesiden. Regel: Hvis listningen af roden eller af en sektionsmappe fejler, afbrydes hele kørslen uden ændringer i `content/`. Kun en komplet listning kan fjerne indhold. Forslag til en ekstra sikring: Hvis en kørsel vil fjerne mere end halvdelen af en sektion, stopper den og rapporterer. Den kan køres igen med `--allow-mass-removal`. Sikringen kan undværes, hvis I foretrækker det helt enkle.

4. **Hash-baserede download-URL'er bryder kravet om stabile URL'er.** I dag ligger PDF'er på `/downloads/<sha256>.pdf`, så URL'en skifter ved hver ny version af filen. Et link til vedtægterne i en mail ville dermed dø ved næste rettelse. Forslag: PDF'en ligger på `/dokumenter/<slug>.pdf`, og detaljesiden på `/dokumenter/<slug>/`. Billeder i vejledninger kan beholde indholdsbaserede navne, fordi der ikke linkes direkte til dem udefra.

5. **Synkroniseringskontoen skal kunne læse genvejens mål, ikke kun mappen.** Når hjemmesidens mappe deles med kontoen, giver det ikke adgang til de filer, genvejene peger på. Hvis kontoen er en servicekonto, skal hver intern fil, der publiceres via genvej, også deles med den. Alternativt skal filen ligge i et fællesdrev, hvor kontoen er læser. Ellers bliver "manglende adgang" den almindeligste fejl i rapporten. Det bør indgå i åben beslutning 3 og giver en fordel for et fællesdrev, som foreningen ejer.

6. **Git-historikken gør fejlpublicering permanent.** Fjerner man en fil fra mappen, forsvinder den fra siden, men den ligger stadig i Git. Repository'et bør derfor være privat (åben beslutning 1), selvom alt i `content/` er offentligt. Redaktørerne skal vide, at sletning fra hjemmesiden ikke sletter historikken. En egentlig fjernelse kræver en omskrivning af historikken, som en udvikler skal udføre.

7. **`modifiedTime` ændrer sig ved usynlige redigeringer.** Forslag, formatering og andre ændringer uden synligt resultat ændrer `modifiedTime`. Hvis det skrives direkte i frontmatter, giver hver kørsel støj i Git, og datoen "Opdateret" ændrer sig uden grund. Forslag: `updatedAt` opdateres kun, når titel, brødtekst, billeder eller PDF-bytes faktisk har ændret sig. Ellers beholdes den tidligere værdi.

8. **Astros Markdown-pipeline tillader rå HTML.** Når Astro renderer `.md` fra `content/`, sendes HTML uændret igennem. Valideringen i synkroniseringen er derfor ikke nok, hvis nogen retter i en fil i hånden. Forslag: Det samme mdast-baserede tjek af tilladte elementer køres ved synkronisering og som remark-plugin i Astro, og buildet fejler ved ukendte noder. Pakkerne `remark-parse`, `remark-gfm` og `mdast-util-*` er allerede installeret som transitive afhængigheder, men tilføjes eksplicit i `package.json` for at undgå en skjult afhængighed.

9. **`AGENTS.md` er i direkte modstrid med planen.** Punkt 5 kræver godkendelse af `id + contentHash`, og punkt 7 forbyder Google API. Punkt 4 om mockadapteren skal formuleres om. Jeg foreslår at opdatere `AGENTS.md` i samme commit, som fjerner godkendelsesmekanikken. Ordlyden fremgår af afsnit 7. Fordi filen indeholder projektets egne regler, ændres den først efter godkendelse.

## 2. Genbrug, ændring og fjernelse

| Fil | Beslutning | Bemærkning |
|---|---|---|
| `lib/contracts/blocks.ts` | Genbruges midlertidigt | Er mellemformatet, hvis fase 1 anbefaler egen parser eller en kombination. Fjernes, hvis Drive-eksporten vælges alene |
| `lib/contracts/content.ts` | Ændres | `contentHash`, `sealRecord`, `normalizeRecord`, `canonical`, `source` og `visibility` udgår. Kategori-enum'et erstattes af sektionsnøglen fra konfigurationen. Typerne `document`, `guide`, `notice` og `event` beholdes som frontmatter- og JSON-skemaer til Astros collections |
| `lib/adapters/content-adapter.ts`, `mock.ts` | Fjernes | Kontrakten flyttes ét lag ned til `DriveSource` (se afsnit 4). Den falske Drive i tests erstatter mockadapteren |
| `lib/adapters/google.ts` | Erstattes | Pilotindekset (`googlePilotSchema`) udgår. `materializeGoogleAssets` og billedgrænserne genbruges i synkroniseringen |
| `lib/adapters/google/client.ts` | Udvides | Sikker GET, størrelsesgrænser, timeout, at billeder hentes uden token og fejltekster uden hemmeligheder genbruges. Nyt: `files.list` med paginering, `shortcutDetails` og `files.export`. Docs-kaldet skifter til `PREVIEW_WITHOUT_SUGGESTIONS` |
| `lib/adapters/google/blocks.ts` | Genbruges eller fjernes efter fase 1 | Hvis den bevares: forslag udelades i stedet for at blive afvist, og der tilføjes konvertering fra blokke til Markdown |
| `lib/publication/assets.ts` | Genbruges | `imageFormat` og `verifyFile`, dvs. signatur- og MIME-tjek. `mediaUrl` og `recordAssets` ændres til stier pr. dokument |
| `lib/publication/store.ts` | Fjernes | Godkendelser, manifest, snapshots og `selectPublic`. `safeRead` flyttes til et lille fs-modul |
| `lib/publication/prepare-pilot.ts`, `pilot-review.ts` | Fjernes | Forhåndsvisning af snapshots erstattes af rapporten og `bun run dev` |
| `lib/site/blocks.ts`, `markdown.ts` | Fjernes | Astros Markdown-rendering med tjekket af tilladte elementer overtager. `blocks.ts` beholdes kun, hvis fase 1 vælger at gemme blokke |
| `lib/site/content.ts` | Erstattes | Læser fra `astro:content` i stedet for `.build/content.json` |
| `scripts/build.ts` | Ændres | Lås, staging, outputkontrol og atomisk rename bevares. Godkendelsesudvælgelsen udgår. PDF'er kopieres fra `content/dokumenter` til `/dokumenter/<slug>.pdf` |
| `scripts/verify-output.ts` | Ændres | Tilladte filer udledes af `content/` og `_slugs.json`. Canaries flyttes til synkroniseringstests med en falsk Drive. Tilladte filer udvides med Astro-optimerede billeder og redirect-sider |
| `scripts/prepare-content.ts`, `google-prepare*.ts`, `create-fixtures.ts`, `use-realistic-content.ts`, `mock-guides.ts` | Fjernes | Erstattes af `scripts/sync.ts` |
| `fixtures/` (hele mappen) | Fjernes | Snapshots, godkendelser og manifest. Testdata flyttes til `tests/fixtures/drive/` |
| `config/google-pilot.example.json` | Erstattes | Af `config/site.json`, se afsnit 3 |
| `src/pages/**` | Ændres | Ruter pr. sektion i stedet for pr. type. Ny redirect-generering. Kalendersiden skjules, til kalenderen er i brug |
| `tests/build.test.ts`, `publication.test.ts` | Omskrives | Integrationstestens mønster med isoleret tempmappe og flere fulde builds bevares |
| `tests/google-adapter.test.ts`, `markdown.test.ts` | Delvist genbrugt | Tests af klientsikkerhed og XSS bevares. Tests af pilotkonfiguration og versionsbinding udgår |
| `.github/workflows/checks.yml` | Genbruges | Uændret |
| `docs/` | Opdateres i fase 2 | `architecture-v1.md`, `google-pilot.md` og `local-pilot-approval.md` markeres som historiske. `README.md` omskrives |

## 3. Foreslået struktur

### Konfiguration: `config/site.json`

```json
{
  "rootFolderId": "…",
  "sections": {
    "foreningen":   { "type": "guide",    "category": "foreningen", "accepts": ["gdoc"] },
    "vejledninger": { "type": "guide",    "category": "vejledning", "accepts": ["gdoc"] },
    "dokumenter":   { "type": "document", "accepts": ["pdf"] },
    "nyheder":      { "type": "notice",   "source": "sheet" }
  },
  "ignoredFolders": ["kalender", "redaktion"]
}
```

Sektionsnøglen er både mappens navn i Drive og første del af URL'en. Konfigurationen valideres med Zod. Synkroniseringen finder sektionsmapperne efter navn direkte under roden. Hvis der er to mapper med samme navn, eller hvis en konfigureret mappe mangler, er det en fejl, og kørslen afbrydes. Andre mapper og filer i roden giver en advarsel. `ignoredFolders` gør det tydeligt, at kalender og redaktion bevidst ikke læses. Alternativt kan sektionernes mappe-ID'er skrives i konfigurationen. Det er mere robust, hvis nogen omdøber en mappe, men kræver redigering af repository'et.

### `content/`

```text
content/
├── _slugs.json                 # vedligeholdes af sync; udvikler må rette slug
├── _redirects.json             # manuel: gamle WordPress-stier → nye stier
├── foreningen/
│   └── <driveId>.md
├── vejledninger/
│   ├── <driveId>.md
│   └── <driveId>/              # billeder kun for dette dokument
│       └── <sha256-prefix>.png
├── dokumenter/
│   ├── <driveId>.pdf           # bytes uændret
│   └── <driveId>.json          # metadata
└── nyheder/
    └── nyheder.json            # alle offentlige rækker, sorteret efter ID
```

Filerne navngives efter Drive-ID og ikke efter slug. Så skal filen ikke flyttes, når en udvikler ændrer et slug, og omdøbninger giver ingen ændringer i Git. Billederne ligger pr. dokument, så hele mappen kan slettes, når dokumentet fjernes, uden at der skal holdes regnskab med fælles billeder. Drive-ID'er skelner mellem store og små bogstaver, mens macOS ikke gør. Synkroniseringen afviser derfor to ID'er, der kun adskiller sig ved store og små bogstaver. Det sker næppe i praksis.

Eksempel på en vejledning:

```markdown
---
id: 1AbC…
title: Fælleslokalerne
updatedAt: 2026-10-21T08:12:00.000Z
summary: Sådan lejer du fælleslokalerne.
---

## Hvem kan leje?
…
![Plan over fælleshuset](./1AbC…/3f9a2c41.png)
```

Slug ligger kun i `_slugs.json`, så det kun findes ét sted. `summary` udledes ved synkroniseringen og skrives i frontmatter, så redaktøren kan se den samme tekst, som siden viser. Den udledes af første afsnit, der ikke er en overskrift, og afkortes ved en ordgrænse til højst 300 tegn. Der gemmes ingen genvejs-ID'er, mappestier eller kontooplysninger.

### `_slugs.json`

```json
{
  "1AbC…": { "section": "vejledninger", "slug": "faelleslokalerne", "previousPaths": ["/foreningen/faelleslokaler/"] }
}
```

Planen siger `previousSlugs`. Jeg foreslår `previousPaths`, så en fil, der flyttes til en anden sektion, også får et redirect. Ellers ville flytningen fra `/foreningen/x/` til `/vejledninger/x/` bryde URL'en. Slug dannes af titlen ved første publicering: små bogstaver, æ→ae, ø→oe, å→aa, ikke-ASCII fjernes og der bruges bindestreger. Hvis slug'et ville blive tomt, bruges `side-<de første 8 tegn af ID>`. Ved en kollision gemmes intet slug for den nye post. Den publiceres ikke og rapporteres. Den eksisterende post påvirkes ikke. Fjernede poster beholder deres linje, så de får samme URL, hvis de kommer tilbage. Deres redirects genereres ikke, mens de er fjernet.

### Redirects

Astros `redirects`-konfiguration udfyldes ved build ud fra `previousPaths` og `_redirects.json`. Det giver statiske sider med meta-refresh og canonical-link, der virker på enhver statisk host og ikke kræver nye afhængigheder. `.htaccess` med rigtige 301-redirects kan genereres fra de samme data, når hostingen er besluttet. Buildet fejler, hvis et redirect peger på en sti, der ikke findes, eller rammer en eksisterende side.

## 4. Synkroniseringsforløb

```text
1. Indlæs config/site.json og content/_slugs.json (Zod).
2. List rod + hver sektionsmappe komplet (alle sider). Fejl → afbryd, intet skrives.
3. For hver post: genvej → slå målet op (shortcutDetails.targetId); titel = genvejens navn.
   Undermappe / forkert type / genvej til mappe → advarsel, ikke publiceret.
   Mål i papirkurven → behandles som fjernet + advarsel.
   Mål kan ikke læses → fejl; sidste gyldige version beholdes.
   Samme mål-ID i to sektioner eller to gange → fejl for det ID; sidste gyldige version beholdes.
4. Konvertér/hent hver post uafhængigt. Fejl → sidste gyldige version beholdes, fejl i rapporten.
5. Byg et komplet nyt content-træ i .sync/staging (genbrug uændrede filer byte-for-byte).
6. Valider hele træet: Markdown-allowlist, PDF-signatur, slug-unikhed, redirects.
7. Erstat content/ atomisk (rename) og skriv rapport til .sync/report.{md,json}.
8. (Separat trin, fase 4) git commit med liste over nye/ændrede/fjernede sider.
```

**Kontrakten som tests og den rigtige adapter deler**, svarende til punkt 4 i `AGENTS.md`, flyttes til Drive-grænsen:

```ts
interface DriveSource {
  listFolder(folderId: string): Promise<DriveItem[]>;          // komplet, pagineret, eller kaster
  getFile(fileId: string): Promise<DriveItem>;                 // metadata inkl. trashed
  exportDocument(fileId: string): Promise<ConvertedDocument>;   // metode afgøres i fase 1
  downloadPdf(fileId: string): Promise<Uint8Array>;
  readSheet(fileId: string): Promise<SheetRows>;               // fase 3
}
```

Mappemodellen afprøves med en falsk Drive i hukommelsen (`FakeDrive`). Den rigtige REST-klient implementerer samme interface og afprøves mod kontrollerede API-svar ligesom i dag. Begge returnerer data, der valideres af de samme Zod-skemaer. Rapporten committes ikke. Den kan indeholde navne på filer, der ligger forkert, og som ikke er beregnet til offentligheden.

## 5. Nyheds-ID: forslag

**Anbefaling: et lille Apps Script med en simpel `onEdit`-trigger, bundet til nyhedsarket.** Når en række får en titel og ID-cellen er tom, skriver scriptet et kort, tilfældigt ID, fx `n-7k3q9x`.

Begrundelse:

- Redaktøren skal ikke gøre noget, og ID'et opstår i det øjeblik, nyheden skrives.
- Synkroniseringen forbliver ren læseadgang. Den behøver ikke Sheets-skriveret, og der opstår ikke kapløb med en redaktør, der sorterer rækker, mens synkroniseringen skriver.
- En simpel trigger kræver hverken installation, OAuth-godkendelse eller en bestemt ejer. Den kører som den redaktør, der redigerer. Dermed undgås problemet med installerbare triggere, der holder op med at virke, når den person, der oprettede dem, forlader foreningen.
- Kildekoden ligger i `scripts/apps-script/nyheder-id.gs` i Git, og vejledningen beskriver, hvordan den indsættes.

Svagheder: Scriptet kan slettes ved et uheld, og simple triggere reagerer ikke på ændringer via API. Begge dele fejler sikkert, fordi synkroniseringen rapporterer rækker uden ID eller med dubleret ID som fejl og ikke publicerer dem. Redaktøren kan altid skrive et ID manuelt.

Fravalgt: Hvis synkroniseringen selv udfylder ID'er, kræver det skriveadgang og giver et kapløb ved sortering. Hvis redaktøren selv skriver ID'et, giver det dubletter og ekstra arbejde.

Øvrige antagelser for nyheder: En dato i fremtiden fungerer som `publishFrom`. `Udløber` er inklusiv, så nyheden vises til og med datoen og forsvinder ved build fra kl. 00:00 dagen efter, dansk tid. Links skrives som almindelige URL'er eller som hyperlinks i cellen, der læses via Sheets' `textFormatRuns`. Markdown-syntaks i celler understøttes ikke.

## 6. Fase 1: hvad der afprøves

Kildefiler: pilotvejledningen med tabeller og billede samt de fire kildefiler fra det tidligere register.

1. Eksport via `files.export` som `text/markdown`. Connectoren i denne session understøtter `exportMimeType`, så den kan bruges med det samme.
2. Til sammenligning: `documents.get` med `PREVIEW_WITHOUT_SUGGESTIONS` gennem den eksisterende parser.
3. Skema pr. dokument: overskrifter, lister (også nummererede og indrykkede), links, fed og kursiv, tabeller (flere afsnit i en celle, flettede celler), billeder (base64? alt-tekst?), titelafsnit, faner og tom linje i starten.
4. **Forslag:** Et testdokument med et uaccepteret forslag om indsættelse og et om sletning eksporteres med begge metoder. Det kræver, at nogen opretter forslaget i Drive (se spørgsmål B).
5. Rapport med anbefaling: Drive-eksport, egen parser eller en kombination, fx Docs API → blokke → egen deterministisk Markdown-serializer.

Min forventning, som fase 1 skal be- eller afkræfte: Eksporten er hurtig at tage i brug, men forslag og tabeller med flere afsnit pr. celle taler for kombinationen. Den bevarer den testede parser og giver Markdown, hvis format vi selv styrer.

## 7. Leverancer efter godkendelse

| Fase | Leverance | Tests |
|---|---|---|
| 2a | `config/site.json`, Zod-skemaer, `FakeDrive`, sync af PDF'er med genveje, `_slugs.json` | Fil uden for sektion aldrig med; genvej → målindhold + genvejsnavn; omdøbning bevarer URL; kollisioner/ukendte typer/undermapper rapporteres; listefejl ændrer intet |
| 2b | Docs-sync (metode fra fase 1), billeder pr. dokument, Markdown-allowlist | Forslag kommer ikke med; et dokument, der ikke kan konverteres, beholder sidste version, og resten synkroniseres; rå HTML afvises ved sync og ved build |
| 2c | Astro-collections fra `content/`, sektionsruter, stabile PDF-URL'er, redirects, ny outputkontrol | Fjernet genvej fjerner side, PDF og billeder fra `dist`; manuelt ændret slug → redirect; sitemap/søgeindeks = præcis `content/` |
| 2d | **Separat commit:** fjern godkendelse, snapshots, fixtures, pilot-scripts; opdatér `AGENTS.md`, `README.md`, docs | Hele testsuiten + typecheck + build grønne |
| 3 | Nyhedsark → `nyheder.json`, Apps Script-kilde | `kladde`/tom/ukendt status ikke publiceret; udløbne ikke i build; rækkeorden ændrer ikke ID'er; manglende/dublet-ID rapporteres |
| 4 | Rapport (md + json), commit-trin, forslag til kørselsmiljø | Rapportens indhold for hver fejltype; ingen commit når intet ændrer sig |

Forslag til ny ordlyd i `AGENTS.md`, punkt 4–7:

> 4. Indhold synkroniseres fra Drive til `content/` i Git. Den rigtige Drive-klient og testens `FakeDrive` opfylder samme `DriveSource`-interface og samme Zod-validering.
> 5. En fil er offentlig, hvis og kun hvis den eller en genvej til den ligger direkte i en konfigureret sektionsmappe. Ikke-accepterede forslag må aldrig publiceres. Test begge dele.
> 6. Default deny: ukendte filtyper, undermapper, fejl og ulæselige filer publiceres ikke og rapporteres. En ufuldstændig listning må aldrig fjerne indhold.
> 7. Ingen database, login, CMS eller produktionsdeploy. Kun læseadgang til Google. Ingen push, upload eller Drive-ændringer uden udtrykkelig godkendelse.

## 8. Antagelser

Antagelserne er dokumenteret frem for at blive stillet som spørgsmål. Ret dem, hvis de er forkerte.

- URL'er følger sektionsmappen: `/foreningen/…`, `/vejledninger/…`, `/dokumenter/…` og `/nyheder/…`. Den nuværende `/opslag/` udgår.
- PDF'er får stabile URL'er efter slug (fund 4).
- Et mål i papirkurven tæller som fjernet. Et mål, der ikke kan læses, beholder sidste gyldige version og giver en fejl (fund 3 og planens regel om adgang).
- Et billede uden alt-tekst er en fejl for dokumentet. Rapporten forklarer, hvor alt-teksten sættes i Docs.
- Dokumenter med flere faner afvises, som i dag.
- `event`-skemaet beholdes, men har ingen collection eller side, før kalenderen bygges.
- Det illustrative mockindhold og de seks bearbejdede WordPress-vejledninger flyttes ikke til `content/`, fordi de ikke kommer fra en sektionsmappe. `content/` fyldes kun ved en rigtig synkronisering. Testene bruger egne tempmapper.
- De nye afhængigheder er de eksplicitte remark- og mdast-pakker, der allerede ligger i lockfilen. Der tilføjes ingen andre.
