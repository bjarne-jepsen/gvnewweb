# Grøndalsvænge 2.0 — lokal POC

Statisk Astro + TypeScript-site for Andelsboligforeningen Grøndalsvænge. Indholdet vedligeholdes i foreningens Google Drive. En synkronisering kopierer det til `content/` i Git, og Astro bygger sitet alene derfra. Der er ingen database, intet login og ingen produktionsdeploy.

## Mappemodellen

**En fil er offentlig, hvis og kun hvis den, eller en genvej til den, ligger direkte i en af hjemmesidens sektionsmapper.** Hvem der må publicere, styres af delingen af mapperne i Drive. Koden kender ingen roller.

```text
Grøndalsvænge hjemmeside (fællesdrev)
├── foreningen/     Google Docs → faste informationssider
├── vejledninger/   Google Docs → vejledninger
├── nyheder/        Ét Google Sheets-ark med nyheder
├── kalender/       Ikke i brug
└── redaktion/      Læses ikke
```

Sammenhængen mellem mappe og indholdstype ligger i [config/site.json](config/site.json). Navigation og sektionstekster ligger i [lib/site/sections.ts](lib/site/sections.ts).

- **Genveje:** En genvej publicerer målfilens indhold. Genvejens navn bliver titlen, og målets ID bliver indholdets ID.
- **Titel:** Filens navn (eller genvejens).
- **Ingen dokumenter:** Vedtægter, regulativer, referater og andre dokumenter ligger i ProBo hos administrator. En PDF i en sektionsmappe publiceres ikke og giver en advarsel.
- **Forslag:** Google Docs hentes med Docs API i visningen `PREVIEW_WITHOUT_SUGGESTIONS`. Ikke-accepterede forslag kommer aldrig med. Et svar, der alligevel indeholder forslag, afvises.
- **Fejl:** Et dokument, der ikke kan hentes eller konverteres, beholder sin sidste gyldige version, og resten synkroniseres. En fejlet eller ufuldstændig mappelistning ændrer intet.

## Kør lokalt

Forudsætninger: Bun 1.3.11 eller nyere og Node.js 22.12+. Node bruges til Astro. Bun bruges til scripts, installation og tests.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun run dev
```

`bun run build` bygger fra `content/` i `.build/staging`, kontrollerer output og erstatter derefter `dist`. Fejler buildet, bevares det eksisterende `dist`. Build og dev beskyttes af `.build/lock`. Efter en afbrudt dev-server kan låsen blive liggende. Fjern den kun, når ingen build- eller dev-proces kører.

## Synkronisering

```sh
GOOGLE_ACCESS_TOKEN_FILE=~/.gv-google-token bun run sync
```

- **Tokens:** Tokenet skal kunne læse fællesdrevet (`drive.readonly`). Ligger Docs-adgangen (`documents.readonly`) i et separat token, angives det med `GOOGLE_DOCS_ACCESS_TOKEN_FILE`. Tokens må aldrig ligge i Git eller indsættes i chat.
- **Hvad der skrives:** Sync skriver kun til `content/` og en rapport i `.sync/report.md`. Den committer ikke.
- **Exit-koder:** 0 betyder ingen fejl. 2 betyder, at enkelte filer fejlede, men `content/` er opdateret. 1 betyder, at kørslen blev afbrudt, og intet er ændret.
- **Masseudtagning:** Vil en kørsel fjerne mere end halvdelen af en sektion (og mindst to filer), stopper den. Kør igen med `-- --allow-mass-removal`, hvis det er meningen.

**Samlet kørsel:**

```sh
GOOGLE_ACCESS_TOKEN_FILE=~/.gv-google-token bun run publish
```

Kørslen synkroniserer, skriver rapporten og committer `content/`, hvis noget har ændret sig, og bygger derefter. Commit-beskeden lister nye, ændrede og fjernede sider. Andre ændringer i arbejdsmappen bliver ikke committet, og der pushes aldrig.

- **Exit-koder:** 0 betyder ingen fejl. 2 betyder, at enkelte filer fejlede, men `content/` og `dist` er opdateret. 1 betyder, at sync blev afbrudt, eller at buildet fejlede.
- **Valg:** `--no-commit` synkroniserer og bygger uden at committe. `--allow-mass-removal` virker som ved `sync`.

Den natlige og manuelle kørsel er endnu ikke sat op. Forslaget står i [docs/mappemodel-fase4.md](docs/mappemodel-fase4.md).

### `content/`

```text
content/
├── _slugs.json              id → { section, slug, previousPaths }
├── _redirects.json          valgfri, manuel: gammel sti → ny sti (fx WordPress)
├── <sektion>/<id>.md        frontmatter (id, title, updatedAt, summary) + Markdown
└── <sektion>/<id>/<hash>.png  billeder for ét dokument
```

Filerne i `content/` skrives af sync. `content/` må kun indeholde de konfigurerede sektioner, `_slugs.json` og `_redirects.json`. Fjernes en sektion fra konfigurationen, rydder næste sync den op, og build afviser alt andet. De må ikke rettes i hånden, undtagen `_slugs.json` og `_redirects.json`. Sync og build afviser filer, de ikke selv kan have skrevet.

**URL'er ændrer sig ikke ved omdøbning.** Slug dannes af titlen første gang, et ID ses, og gemmes. Kun en udvikler ændrer det:

```sh
bun run slug -- <drive-id> <nyt-slug>
```

Den gamle sti flyttes til `previousPaths` og bliver en redirect-side. Det samme sker, når en fil flyttes til en anden sektion.

### Nyheder

Der ligger ét regneark i `nyheder/` med én række pr. nyhed. Første række er overskrifterne `ID`, `Dato`, `Titel`, `Tekst`, `Udløber` og `Status`, i vilkårlig rækkefølge.

- **Status:** Kun status `offentlig` publiceres. `kladde`, en tom status og alt andet publiceres ikke og kommer ikke i `content/`. Ukendt status giver en advarsel.
- **ID:** ID'et udfyldes automatisk af [scripts/apps-script/nyheder-id.gs](scripts/apps-script/nyheder-id.gs), som indsættes under *Udvidelser → Apps Script*. En række uden ID publiceres ikke. Kopierer man en hel række, følger ID'et med. Så skal ID-cellen i kopien tømmes, ellers rapporteres de to rækker som dubletter.
- **Dato:** Datoen er publiceringsdatoen. En fremtidig dato vises fra den dag. `Udløber` er valgfri og inklusiv. Begge regnes i dansk tid og filtreres ved build, ikke ved synkronisering.
- **Tekst:** En tom linje i cellen starter et nyt afsnit. Links i cellen og nøgne `https://`-adresser bliver links.
- **Adresse:** Adressen dannes af dato og titel, fx `/nyheder/2026-10-21-generalforsamling/`, og bevares derefter.

### Markdown

Serializeren skriver en lille dialekt: overskrift 2–6, afsnit, fed, kursiv, http(s)-links, punktlister, skillelinjer, tabeller og billeder med alt-tekst. Den samme liste over tilladte elementer valideres ved sync og ved build. Siden renderes af [lib/site/render.ts](lib/site/render.ts), som escaper alt og ikke kender rå HTML. En tabel med kun én række (layout) bliver til almindelige afsnit. Flere afsnit i en celle adskilles med ` · `. Overskriftsniveauer i Docs forskydes ét trin, fordi H1 er sidens titel.

## Output og sikkerhed

- Sider ligger på `/<sektion>/<slug>/` og billeder ved siden af deres side.
- Outputkontrollen ([scripts/verify-output.ts](scripts/verify-output.ts)) tillader kun de forventede filer. Bytes skal være identiske med `content/`. Der må ikke være Drive-ID'er og ingen `<script>`. Sitemap og søgeindeks skal være præcis de offentlige sider.
- Sitemap bruger `https://example.invalid`, og prototypen har `noindex`. Domæne og indeksering besluttes senere.
- Redirects er meta-refresh-sider. Rigtige 301'ere kræver hosting.

## Dokumentation

- [Fase 0: gennemgang og plan](docs/mappemodel-fase0.md)
- [Fase 1: Markdown-eksporten afprøvet](docs/mappemodel-fase1.md) (Drive-eksporten tager forslag med)
- [Fase 2a: PDF-sync](docs/mappemodel-fase2a.md), [2b: Docs-sync](docs/mappemodel-fase2b.md), [2c: Astro fra content/](docs/mappemodel-fase2c.md) og [2d: oprydning](docs/mappemodel-fase2d.md)

De ældre dokumenter om versionsgodkendelse og Google-piloten er historiske. Pilotens snapshots og godkendelser findes i Git-historikken til og med commit `8458a27`.

`.github/workflows/checks.yml` kører låst installation, tests, typekontrol og build ved push og pull requests. Workflowet kræver ingen Google-adgang og udfører ikke deployment.
