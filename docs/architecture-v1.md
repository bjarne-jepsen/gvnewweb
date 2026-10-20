# Grøndalsvænge 2.0 — datakontrakter og publicering (v1)

**Status:** Designoplæg til POC — ikke implementeret  
**Formål:** En statisk Astro-hjemmeside, hvor bestyrelsen vedligeholder indhold i Google Workspace, mens en kontrolleret publiceringsproces eksporterer godkendt indhold. POC'en bruger mockdata med nøjagtig samme normaliserede datastruktur som de kommende Google-adaptere.

## 1. Beslutninger

1. **Én intern kontrakt.** Frontend og publiceringsmotor forbruger `ContentRecord` uanset datakilde. Adapteren er eneste del med viden om Google Docs, Sheets, Drive og Calendar.
2. **Mock først.** `MockContentAdapter` læser lokale JSON-filer i det normaliserede kontraktformat. `GoogleContentAdapter` skal senere levere samme format og bestå samme kontrakttests.
3. **Arbejdsudgave ≠ publiceret version.** Nye ændringer i kildedokumenter må ikke automatisk ændre det offentlige website. Godkendt indhold fastholdes i et versionsbundet publicerings-snapshot.
4. **Default deny.** Kun eksplicit godkendte poster med `visibility: "public"` må ende i HTML, JSON, søgeindeks, sitemap eller offentlige fil-assets. `members` og `board` er reserverede synlighedsklasser, ikke implementerede loginfunktioner.
5. **Ingen database i POC.** Publicerede snapshots kan lagres som versionsstyrede build-inputs, og Astro genererer statiske filer.
6. **Indhold og metadata er forskellige.** Selve teksten kommer primært fra Docs, bilag fra Drive og strukturerede data fra Sheets/Calendar; publiceringsmetadata administreres særskilt.

## 2. Tre lag og ansvar

- **Kilde:** Dokumenter, vejledninger, opslag og kalenderbegivenheder. Et objekt kan redigeres uden at være publiceret.
- **Normaliseret indhold:** En adapter leverer et `ContentRecord` med validerede felter og deterministisk `contentHash` beregnet af den offentligt relevante payload. Mock og Google skal bruge samme kontrakt.
- **Publicering:** Et godkendelsesregister binder indholds-ID til *præcis den version*, der er godkendt. Publiceringsmotoren gemmer et snapshot af denne version. Websitet bygges kun fra publicerede snapshots — aldrig direkte fra levende Google-filer.

**Definition:** `contentHash` er SHA-256 over en kanonisk, sorteret repræsentation af den normaliserede publiceringspayload. Kildesystemets revisionsnummer kan gemmes som diagnostik, men må ikke bruges som den fælles versionsnøgle.

## 3. Fælles datakontrakt

De fire typer har følgende fælles felter:

| Felt | Type | Krav / semantik |
|---|---|---|
| `schemaVersion` | `1` | Kontraktversion; kræves |
| `id` | `string` | Stabilt, unikt ID, uafhængigt af titel/slug |
| `type` | `document \| guide \| notice \| event` | Diskriminator |
| `title` | `string` | Vist overskrift |
| `summary` | `string` | Kort teaser, kan være tom |
| `slug` | `string` | Stabil URL-sti, skal være entydig inden for type |
| `category` | `string` | Kontrolleret taksonomi |
| `visibility` | `public \| members \| board` | Kun `public` kan offentliggøres i POC |
| `updatedAt` | ISO 8601 | Tidspunkt for kildens seneste indholdsændring |
| `source` | objekt | `{provider, sourceId, sourceRevision?}`; intern provenance |
| `contentHash` | `string` | Beregnes ved normalisering, ikke manuelt |

**Vigtigt:** `draft`, `approved`, `published` er *workflowtilstande*, ikke egenskaber, som frontend skal stole på. De ligger i et separat publiceringsregister. Det fjerner modstrid mellem et kildedokuments indhold og den tidligere godkendte version.

### Typefelter

**Document**: `file` (`{assetPath, mimeType, originalFilename}`), `documentKind` (fx vedtægter, referat, regnskab), `effectiveDate?`. Ved publicering kopieres en godkendt binær fil til publicerede assets. Link direkte til en redigerbar Drive-original er ikke en godkendt snapshot.

**Guide**: `bodyMarkdown`, `relatedDocumentIds[]`, `ownerLabel?`. Markdown er et afgrænset præsentationsformat; rå HTML skal afvises eller saniteres. POC understøtter overskrifter, afsnit, punktopstillinger og links. Tabeller/billeder er eksplicit senere scope.

**Notice**: `bodyMarkdown`, `publishFrom?`, `expiresAt?`, `priority` (`normal \| important`). Udløbet indhold fjernes ved ny build; ønskes øjeblikkeligt udløb, kræves hyppigere build eller anden distributionsmodel.

**Event**: `startsAt`, `endsAt`, `timeZone` (`Europe/Copenhagen`), `locationText?`, `registrationUrl?`. For POC er kalenderposter udvalgte offentlige arrangementer; gæstelister, deltageremails og private kalendere må aldrig medtages. Gentagelser omsættes i adapteren til konkrete forekomster inden for et defineret vindue.

## 4. Illustrativt normaliseret mockobjekt

```json
{
  "schemaVersion": 1,
  "id": "guide-ombygning",
  "type": "guide",
  "title": "Ombygning af din bolig",
  "summary": "Sådan søger du om ændringer af huset.",
  "slug": "ombygning",
  "category": "Bolig og vedligehold",
  "visibility": "public",
  "updatedAt": "2026-10-20T08:00:00Z",
  "source": {
    "provider": "mock",
    "sourceId": "mock-doc-ombygning"
  },
  "contentHash": "sha256:<beregnet-af-normaliseringslaget>",
  "bodyMarkdown": "## Før du går i gang\n\nKontakt bestyrelsen...",
  "relatedDocumentIds": ["doc-husorden"]
}
```

Bemærk, at `source.provider` senere bliver `google`, mens resten af objektkontrakten og rendererens brug forbliver identisk. `contentHash` er vist som placeholder; i reelle fixtures beregner normaliseringen den deterministisk.

## 5. Godkendelse, version og snapshot

### Begreber

- **Candidate:** Seneste normaliserede udgave af kildeindholdet.
- **Prepared snapshot:** Fastfrosset, valideret kandidat, der kan forhåndsvises. Har en uforanderlig `contentHash` og, ved dokumenter, en fastholdt filkopi.
- **Approval:** Godkendelse af et bestemt `id + contentHash`, udført af en ansvarlig person.
- **Published snapshot:** Sidst godkendte, offentlige udgave. Astro bygger altid på dette.

### Tilstande

`draft -> prepared -> approved -> published -> superseded/withdrawn`

Et dokument kan ændre sig efter publiceringen uden at ændre det publicerede snapshot. Den nye kandidat forberedes separat og afventer ny godkendelse. Ved tilbagetrækning fjernes objekt og associerede offentlige assets ved næste deployment.

### Eksempel: godkendelsespost

```json
{
  "contentId": "guide-ombygning",
  "approvedHash": "sha256:7b...",
  "approvedAt": "2026-10-20T10:00:00Z",
  "approvedBy": "editor-id",
  "decision": "publish"
}
```

**Kritisk invariant:** Motoren må aldrig tage *den nyeste Google-version* blot fordi ID'et tidligere blev godkendt. Den må kun publicere de bytes, der svarer til `approvedHash`, eller bevare det sidst publicerede snapshot. En ændring mellem forhåndsvisning og godkendelse kræver ny klargøring.

**POC-afgrænsning:** Godkendelsesregister og snapshots simuleres med lokale fixture-filer og styres i tests. Google Workspace-arbejdsgangen for menneskelig godkendelse designes, men bygges først i integrationens fase. En senere Google Sheet- eller Apps Script-løsning skal godkende den forberedte version, ikke bare sætte et tidløst `approved=true` på en kildefil.

## 6. Den planlagte Workspace-struktur

**Shared Drive: Website – publiceringskilder**

- `01 Dokumenter/` — formelle dokumenter og bilag i originalformat
- `02 Vejledninger/` — Google Docs; én vejledning pr. dokument
- `03 Opslag/` — Google Sheet med én række pr. opslag eller et opslag pr. dokument med metadata i et indeks
- `04 Kalender/` — reference til en dedikeret offentlig kalender
- `05 Publicering/` — metadataregister: indholds-ID, kategori, synlighed, ønsket URL, godkendelsesbeslutning, ansvarlig, tidsstempler

Denne struktur er en **publiceringskilde**, ikke en kopi af alle bestyrelsens fortrolige arbejdsmapper. Brug mindst mulige API-rettigheder. Kalenderbegivenheder og opslagsrækker skal også have stabile ID'er; rækkenummer er ikke en identitet.

## 7. Kildeinterface (konceptuelt)

```ts
type ContentType = 'document' | 'guide' | 'notice' | 'event';

type ContentRecord = DocumentRecord | GuideRecord | NoticeRecord | EventRecord;

interface ContentAdapter {
  listCandidates(): Promise<ContentRecord[]>;
}

const adapter: ContentAdapter =
  process.env.CONTENT_SOURCE === 'google'
    ? new GoogleContentAdapter()
    : new MockContentAdapter();
```

**Kontraktstest:** Begge adaptere skal returnere objekter, der består samme Zod-validering. Frontend må ikke importere nogen Google SDK eller kende rå Google-felter. Valg af adapter afgøres alene i build-processen.

## 8. Validerings- og sikkerhedsregler

- Afvis forkert `schemaVersion`, ugyldige datoer, dublerede `id`/URL'er og ugyldige referencer.
- Rendér kun godkendte snapshots med `visibility === 'public'`.
- Generér søgeindeks og sitemap fra **præcis det samme** offentlige datasæt som websiderne.
- Kopiér aldrig rå kildeobjekter, interne metadata, tokens, private kalenderfelter eller ikke-godkendte filer til statisk `dist/`.
- Konvertér og sanitér Markdown/links og undgå vilkårlig HTML fra Docs.
- Hold secrets i GitHub Actions secrets; aldrig i repo, mockdata eller klientbundles.
- Fail closed: Hvis synlighed eller godkendelse ikke kan verificeres, må elementet ikke publiceres.
- Fail safe: Hvis build eller validering fejler, skal den eksisterende publicerede version forblive tilgængelig. Selve deploy-metoden skal senere testes for atomisk eller staging-baseret release; FTP-upload i sig selv garanterer ikke atomisk skift.

## 9. POC-projektstruktur

```text
groendalsvaenge-web/
  src/
    components/
    layouts/
    pages/
  lib/
    contracts/           # Zod-skemaer og TypeScript-typer
    adapters/
      mock.ts
      google.ts          # interface/stub i POC
    publication/
      prepare.ts         # valider og frys candidate
      approve.ts         # match id+hash mod register
      select-public.ts   # filtrér godkendte snapshots
  fixtures/
    candidates/
      documents.json
      guides.json
      notices.json
      events.json
    approvals.json
    published/           # versionsbundne testsnapshots
  tests/
    contracts.test.ts
    publication.test.ts
  scripts/
    build-content.ts
  astro.config.mjs
```

Det er et **logisk skelet**, ikke en instruks om at oprette tomme mapper uden formål. Filnavne kan tilpasses, hvis Codex ser en enklere struktur uden at bryde lagdelingen.

## 10. POC-acceptkriterier

1. Mockadapteren leverer alle fire typer i en fælles valideret kontrakt.
2. Én vejledning og ét dokument kan vises som statiske Astro-sider.
3. Ændring i mock-kilden uden ny godkendelse ændrer **ikke** offentlig visning eller downloadfil.
4. Godkendelse af ny `contentHash` og efterfølgende build opdaterer den offentlige version.
5. `members`, `board`, ukendte og ikke-godkendte poster findes ikke i `dist`, søgeindeks eller sitemap.
6. Ugyldige data stopper build med en konkret fejl, mens sidste gyldige release bevares.
7. Renderer/komponenter indeholder ingen datakilde-specifik logik.
8. En anden person kan følge en kort README og køre tests og lokal build.

## 11. Bevidst uden for POC

- Login og adgangsbegrænset indhold
- Realtidsopdateringer og push-notifikationer
- Komplet redaktionelt interface
- Import/migrering af hele WordPress-historikken
- Fuld understøttelse af komplekse Google Docs-tabeller og billeder
- Integration med Foreningsassistenten
- Driftsopsætning i produktion og domæneskift

## 12. Næste trin for Codex

**Discovery:** Vurder kontrakt og publiceringsinvarians, herunder docs/assets, tidszoner og adgangskontrol. Påpeg mangler, der reelt påvirker POC'en.

**Plan:** Foreslå den mindst komplekse implementering med Zod-skemaer, 4 mock-fixtures, versionsbundne snapshots, tests og to Astro-visninger. Ingen Google API-integration endnu.

**Implementering:** Gennemføres først efter godkendelse af planen. For hver fase: tests, kort opsummering, tydelige afvigelser.

**Åbne produktbeslutninger inden integration:** Hvordan bestyrelsen godkender et konkret prepared snapshot i Google Workspace; hvilke typer dokumenter der må være offentlige; hvor ofte builds kører; om kalenderposter kan publiceres automatisk fra en dedikeret publiceringskalender.