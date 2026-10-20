# Grøndalsvænge 2.0 — lokal POC

Statisk Astro + TypeScript-prototype med Zod-validerede mockdata. Den oprindelige mock-POC har ingen Google-afhængighed. En særskilt Google-pilot kan klargøre to valgte kilder til manuel gennemgang; almindelig build bruger fortsat lokale, godkendte snapshots. Der er ingen loginfunktion, database eller produktionsdeployment. Seks vejledninger er forkortede, bearbejdede prøveversioner af offentlige sider på groendalsvaenge.dk. Den oprindelige dokumentvejledning, PDF og kalender er fortsat illustrative.

## Kør lokalt

Forudsætninger: Bun 1.3.11 eller nyere og Node.js 22.12+ (testet med Node 24.13.1). Node bruges til Astro; Bun bruges til scripts, installation og tests.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun run dev
```

Dev-serveren viser adressen i terminalen (normalt http://127.0.0.1:4321). Den læser godkendte snapshots, ligesom build. Stop serveren før en ny build. Ændringer i fixtures kræver genstart. En afbrudt proces kan efterlade `.build/lock`; fjern kun denne fil, når ingen build/dev kører.

`bun run build` bygger i `.build/staging`, kontrollerer output og erstatter derefter lokal `dist`. Fejl før promotion ændrer ikke eksisterende `dist`. Dette er en lokal releaseproces; atomisk produktionsdeploy er ikke implementeret eller påstået.

## Data og versionsbinding

- `fixtures/candidates/{documents,guides,notices,events}.json`: seneste normaliserede kildedata. Mock- og fremtidig Workspace-adapter deler `ContentAdapter` og kontrakttests. Google-adapteren er bevidst ikke implementeret.
- `fixtures/assets/`: private kildefiler. `assetPath` er relativ til denne rod.
- `fixtures/snapshots/<id>/<hash>/`: uforanderligt prepared snapshot med record og eventuel PDF-kopi. En godkendt version findes her; byggen læser aldrig candidate som erstatning.
- `fixtures/approvals.json`: versionsbestemte beslutninger med ansvarlig og tidspunkt.
- `fixtures/manifest.json`: præcis én ønsket version pr. publiceret ID. De valgte snapshots udgør det publicerede release-input.

Mock JSON indeholder **hele ContentRecord-kontrakten**, inklusive korrekte hashes. Adapteren validerer dem; den ignorerer ikke en forkert hash. Fælles `sealRecord` bruges ved normalisering til at beregne hash, og kan senere bruges af Google-adapteren. Filens hash og størrelse beregnes fra dens bytes, før recorden forsegles.

### Afprøv en ændring

1. Redigér en candidate. Beregn dens nye hash med `sealRecord` fra `lib/contracts/content.ts`. Ved PDF-ændringer opdateres også `file.assetHash` og `file.sizeBytes`. Den gamle snapshotfil skal bevares.
2. Kør `bun run build`. En gyldig, ændret candidate uden ny godkendelse ændrer ikke offentlig tekst eller download. En ugyldig candidate stopper build.
3. Kør `bun run content:prepare -- guide-dokumenter` (eller et andet ID). Kommandoen fastholder record og eventuelle dokumentbytes og udskriver ID/hash. Den godkender ikke noget.
4. Gennemgå netop denne `record.json` og den fastholdte PDF under `fixtures/snapshots`. I POC sker review i filerne; et redaktionelt preview-UI er ikke bygget.
5. Tilføj en beslutning i `fixtures/approvals.json` med `contentId`, den præcise `approvedHash`, `approvedAt`, `approvedBy` og `decision: "publish"`. Opdatér samme ID i `fixtures/manifest.json` til den godkendte hash. Godkendelsestider skal være entydige pr. ID og må ikke ligge efter buildtidspunktet.
6. Kør tests og build igen. Nu vises den nye version. Commit snapshots, manifest og beslutninger sammen ved versionsstyring.

Tilbagetrækning: tilføj en nyere beslutning med `decision: "withdraw"` for ID'et. Næste build fjerner både siden og dens download og falder ikke tilbage til en ældre godkendelse. Hvis en offentlig vejledning stadig refererer til dokumentet, stopper build, indtil relationen også er rettet og godkendt. En privatmarkering i en candidate tilbagekalder **ikke** et allerede publiceret snapshot; brug en eksplicit withdraw-beslutning.

`bun run scripts/create-fixtures.ts` er alene en vedligeholdelsesgenerator for det illustrative startdatasæt. Den nulstiller candidate-/godkendelses-/manifestfixtures og må ikke bruges som normal redaktionel arbejdsgang. Den køres aldrig af dev, test eller build.

## Sikkerheds- og tidsregler

- SHA-256 omfatter hele den validerede publiceringspayload, inklusive synlighed, URL-slug, datoer, relationer og dokumentets hash/størrelse. `updatedAt` vises og indgår derfor også. Provenance, `contentHash` selv og intern `assetPath` er udeladt.
- Objektnøgler sorteres deterministisk; arrayrækkefølge bevares. Tekst normaliseres til NFC og LF. Tidspunkter normaliseres til UTC. `effectiveDate` er en kalenderdato uden tidszone.
- POC accepterer kun PDF-dokumenter. Hash, størrelse, PDF-signatur og filsti verificeres. Dette er integritetskontrol, ikke en antivirus- eller indholdsrevision af PDF-filer.
- Kun godkendte offentlige snapshots føres videre til rendereren. Provenance og interne stier fjernes, før `.build/content.json` skrives. Alle statiske mellemprodukter er lokale og ignoreret af Git.
- HTML, tabeller, billeder, kodeblokke og referencelinks understøttes ikke i Markdown. Rendereren understøtter afsnit, overskrifter, punktopstillinger og inline HTTP(S)-links og escaper øvrig tekst.
- Én `buildAt` styrer hele udvælgelsen. `publishFrom` er inklusiv, `expiresAt` eksklusiv. Brug fx `BUILD_AT=2026-10-20T14:00:00Z bun run build` til et reproducerbart eksempel. Der sker ingen automatisk udløb uden ny build.
- Kalenderposter er konkrete enkeltforekomster. Tidspunkter vises i Europe/Copenhagen, også over sommer-/vintertid. Gentagelser og heldagsbegivenheder er ikke implementeret.
- Sider, søgeindeks og sitemap bygger fra samme datasæt. Sitemap bruger bevidst `https://example.invalid`; prototypen har `noindex`. Rigtigt domæne og indeksering besluttes ved en senere integrations-/deployfase.
- Outputkontrollen bruger en fil-allowlist, kontrollerer downloadbytes, forventede sider, søgeindeks/sitemap og fravær af private testmarkører og interne felter. Ingen rå fixturemapper kopieres til `dist`.

## Verifikation

`bun test` omfatter kontraktvalidering, versionsinvarians, filmanipulation, manglende godkendelser/snapshots, private relationer, tilbagekaldelse, tidsfiltrering og Markdown-sikkerhed. En integrationstest bygger i en isoleret tempmappe og beviser, at:

1. Kildeændringer i tekst og PDF bevarer samtlige offentlige filbytes.
2. Ny preparation og versionsgodkendelse opdaterer release.
3. En efterfølgende ugyldig candidate stopper build og bevarer sidste gyldige `dist`.

Se [POC-beslutninger](docs/poc-decisions.md), [arkitekturoplæg](docs/architecture-v1.md) og [oprindelig implementeringsplan](docs/implementation-plan.md).

## Mere realistisk prøveindhold

Seks offentlige sider fra Andelshaveren-navigationen er brugt som kilder: boligsalg, ventelister, byggeprojekter, forsikringsskader, renovation og lokaleleje. Hver guide indeholder et link til sin original og er tydeligt markeret som bearbejdet prøveindhold. Der er ingen liveimport eller fuld WordPress-migrering.

Kildematerialet er registreret 20. oktober 2026. `updatedAt` er tidspunktet for klargøring af fixture-indholdet, ikke en påstand om originalsidens seneste redaktionelle ændring. `source.provider` er fortsat `mock`; originalens URL gemmes internt i `source.sourceId` og som et bevidst offentligt kildelink i guideindholdet. Der er ikke importeret en forsikringspolice, personlige ventelister eller indhold fra Internt.

`scripts/mock-guides.ts` vedligeholder de seks prøveversioner. `bun run scripts/use-realistic-content.ts` er en eksplicit vedligeholdelseskommando for dette lokale mockdatasæt: den tilføjer kandidater, fastholder snapshots og opretter simulerede godkendelser. Den bevarer eksisterende snapshotfiler og øvrige godkendelser. Kommandoen er kun til POC-fixtures og køres aldrig af almindelig build/dev; den er ikke en redaktionel eller produktionsmæssig godkendelsesfunktion. Den oprindelige fixture-generator inkluderer også de seks guides ved en fuld nulstilling.

Kildelinks og afgrænsninger er samlet i [kildeoversigten](docs/mock-content-sources.md).

## Google-pilot

Google-piloten er dokumenteret i [docs/google-pilot.md](docs/google-pilot.md). Den understøtter én Google Docs-vejledning med tekst, tabeller og billeder samt én PDF i Drive. Guidekontrakt v2 er struktureret; eksisterende v1-snapshots og deres hashes bevares. Google-hentning og preparation godkender ikke indhold.

De valgte rigtige testkilder er kun klargjort lokalt til review og er ikke føjet til den offentlige release. Adgangstokens, rå API-svar og prepared pilotmapper ligger uden for Git under `.local/`.

`.github/workflows/checks.yml` kører låst installation, tests, typekontrol og statisk build ved push og pull requests. Workflowet kræver ingen Google-adgang og udfører ikke deployment. Den faktiske hosted kørsel er endnu ikke verificeret.
