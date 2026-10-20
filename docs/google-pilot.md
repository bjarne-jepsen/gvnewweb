# Google-pilot — én vejledning og én PDF

Godkendt 20. oktober 2026 som næste fase efter mock-POC'en. Brugeren valgte to konkrete testfiler og manuel snapshotgodkendelse i Git. Da testdokumentet indeholdt tabeller og et billede, godkendte brugeren også udvidelsen af kontrakten til disse elementer.

## Implementeret

- POC-reference: lokal commit `8a68dc8`, inklusive GitHub Actions-checks. Ingen push eller produktionsdeployment er udført. Workflowet er klargjort; en faktisk hosted CI-kørsel kan først verificeres efter push.
- `GoogleContentAdapter` implementerer samme ContentAdapter-interface og består samme genbrugelige kontrakttest som mockadapteren.
- REST-klienten foretager kun GET-kald til de to valgte fil-ID'er. Der søges eller listes ikke i Drive.
- Indeks og adgangstoken er lokale; Google-hentning indgår ikke i almindelig build eller CI.
- Google Docs konverteres til en struktureret guide i schemaVersion 2. PDF bruger den eksisterende dokumentkontrakt.
- `google:prepare` fastholder kandidater, assets og prepared snapshots og giver en lokal review.html. Den godkender eller publicerer ikke noget.

## Kontrakt v2 og kompatibilitet

Guide v1 kræver bodyMarkdown og tillader ikke bodyBlocks. Guide v2 kræver bodyBlocks og tillader ikke bodyMarkdown. De øvrige indholdstyper forbliver i v1. Alle eksisterende fixtures og snapshots valideres fortsat med deres uændrede hashes.

Bloktyper: afsnit, overskrift (niveau 2–6), punktopstilling, skillelinje, tabel og billede. Tekst består af eksplicitte inline-elementer med tekst, valgfrit HTTP(S)-link og valgfri fed/kursiv. Ingen Google HTML eller CSS videreføres. Tekst escaper rendereren altid.

Tabeller bevarer rækkefølge, tomme celler og flere tekstafsnit pr. celle. I denne pilot understøttes rektangulære tabeller uden flettede celler, indlejrede tabeller eller billeder i celler. Tabeloverskrifter opfindes ikke; celler renderes som td, og hver tabel får en neutral nummereret caption. Kildens layout og farver kopieres ikke.

Billeder skal være PNG, JPEG eller WebP og have en ikke-tom alternativ tekst fra dokumentet eller det eksplicitte pilotindeks. SVG, eksterne vilkårlige billedværter og live Google-billedlinks accepteres ikke. Billedfiler hentes uden at videresende API-adgangstokenet. Hver fil får hash, størrelse, MIME-type og en privat relativ kildefilsti. Offentlige URL'er er `/media/<sha256>.<format>`.

Publiceringshashen omfatter hele blokkens indhold, herunder tabelceller, alt-tekst og billedfilens hash/størrelse, men udelader intern assetPath. Ingen eksisterende v1-payload ændres. Prepared snapshots indeholder en fastholdt kopi af hvert billede, og alle bytes verificeres ved hver publicering. Tilbagetrækning fjerner billedet fra næste output, medmindre en anden valgt, godkendt record stadig bruger samme fil.

Flere faner, uafklarede forslag, sidehoveder/-fødder, fodnoter, forankrede objekter, nummererede eller indrykkede lister og andre ikke-understøttede strukturer afvises frem for at blive tabt lydløst.

## To transportformer — samme normalisering

### Selvstændig REST-adapter

```sh
mkdir -p .local/google-pilot
cp config/google-pilot.example.json .local/google-pilot/config.json
# Indsæt de to valgte fil-ID'er og evt. alt-tekst i det lokale indeks.
GOOGLE_ACCESS_TOKEN_FILE=/sti/til/kortlivet-token bun run google:prepare -- .local/google-pilot/config.json
```

Tokenfilen må ikke ligge i Git. Send ikke tokens i chat. Der er ikke implementeret login, token-refresh eller en permanent servicekonto. Disse vælges før en senere automatiseret driftsopsætning. En teknisk identitet bør kun have læseadgang til de særskilte testfiler, og kun nødvendige API-scopes skal tildeles.

Drive-metadata hentes før og efter læsning af Docs, PDF og billeder. Ændret version eller metadata afviser hele importen før filer skrives. PDF-størrelse og eventuel Drive-checksum verificeres. Netværksfejl, for store svar og HTTP-fejl afbryder uden at publicere eller vise tokens og rå fejlsvar. Den separate REST-transport er testet med kontrollerede API-svar; en livekørsel med selvstændigt lokalt token er endnu ikke udført.

### Autentificeret Codex Google Drive-forbindelse

Pilotens rigtige kilder blev læst via den allerede tilsluttede Google Drive-forbindelse. Forbindelsen returnerer fladgjorte Docs-faner og filtrerede Drive-metadata og udleverer ikke sit API-token eller Drive-versionen til den lokale proces. Derfor kaldes denne afprøvning en **connector-capture**, ikke en live REST-kørsel med Drive-versionstjek.

Den valgte Docs-revision blev læst igen og var uændret. PDF'en blev hentet to gange og havde identiske bytes og uændrede observerede metadata. De lokale, autentificeret hentede svar og binære filer behandles derefter af præcis samme normaliseringsfunktion som REST-adapteren:

```sh
bun run google:prepare-capture -- .local/google-pilot/config.json .local/google-pilot/source-check/capture.json
```

Capture-kommandoen kontrollerer revisions-/bytebeviserne mod de lokale kildefiler og producerer udelukkende prepared snapshots og review. Den foretager ingen ny Google-hentning og kan derfor ikke hævde at vise kildens aktuelle tilstand ved en senere genkørsel. En ny kildelæsning kræver en ny capture eller REST-kørsel.

## Resultat med de valgte kilder

To prepared snapshots ligger lokalt under `.local/google-pilot`, uden for Git og offentligt output. Den normaliserede vejledning indeholder otte tabeller og ét billede. Teksten fra afsnit og tabelceller er sammenlignet med kildens tekst efter ensartet normalisering af whitespace og er bevaret. Billedet manglede alternativ tekst, som derfor blev tilføjet i pilotindekset efter visuel gennemgang. Originalerne er ikke redigeret.

PDF'en er en separat testfil; sammenkoblingen i pilotdatasættet betyder ikke, at den oprindeligt var bilag til Docs-teksten. Ingen ny publiceringsgodkendelse er oprettet for nogen af de to rigtige kilder.

## Manuel godkendelse i Git

1. Åbn den konkrete prepared-mappes review.html og dens fastfrosne PDF. Kontrollér tekst, tabeller, billede, alt-tekst og de to viste hashes.
2. Kontrollér, at begge kilder må offentliggøres, og at relationen mellem dem er ønsket. Read-adgang til Drive er ikke i sig selv en publiceringsgodkendelse.
3. Efter eksplicit menneskelig versionsgodkendelse kopieres netop disse uforanderlige snapshotmapper til fixtures/snapshots. De normaliserede kandidater føjes til de relevante lokale JSON-filer. Intet eksisterende snapshot overskrives.
4. Tilføj publish-beslutninger med de konkrete ID'er og hashes, reelt godkendelsestidspunkt og godkender i fixtures/approvals.json. Føj de samme par til fixtures/manifest.json.
5. Kør tests, typekontrol og build, og commit snapshots, kandidater og register samlet. En efterfølgende ændring i Google kræver ny preparation og ny godkendelse.

Der er fortsat ingen produktion eller automatisk publicering fra Google.

## API-grundlag

- [Google Docs documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get): faner og forslag hentes eksplicit.
- [Google Docs Document](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents): Docs-revisions-ID returneres kun ved redigeringsadgang; REST-adapteren kræver derfor ikke dette ID for en læseidentitet.
- [Google Drive files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get): metadata og binære downloads.
- [Google Drive File](https://developers.google.com/workspace/drive/api/reference/rest/v3/files): Drive-version, størrelse og valgfri SHA-256-checksum.

## Verifikation

43 tests består. Astro/TypeScript: 0 fejl, 0 advarsler og 0 hints. Låst installation og statisk build består. De eksisterende 15 offentlige mock-sider og deres datasæt er fortsat de eneste publicerede input; pilotens rigtige kilder findes kun i lokale prepared snapshots. Forhåndsvisningen af billede og tabeller er gennemset i browseren.
