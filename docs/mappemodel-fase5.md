# Mappemodellen — fase 5: oplysningssite uden dokumenter

**Status 22. oktober 2026: plan. Afventer godkendelse, før der skrives kode.**

Grundlag: [docs/indholdsanalyse.md](indholdsanalyse.md) og brugerens godkendelse af strukturen med fem sektioner: `om-groendalsvaenge`, `bo-her`, `faellesskab`, `foreningen` og `nyheder`. Dokumenter deles ikke længere på sitet, men ligger i ProBo.

## Mål

Sitet er et rent oplysningssite. Det består af Google Docs-sider i fire sektioner og nyheder fra arket. Det har en forside med genveje og de seneste nyheder, en sidefod med kontakt og et link til ProBo, samt redirects fra de gamle WordPress-adresser. PDF-understøttelsen fjernes helt, så der ikke ligger ubrugt kode.

## Leverancer

Fire små leverancer, der hver afsluttes med beståede tests, typekontrol og build. Hver leverance committes for sig.

### 5a — Fjern dokumentsektionen og PDF-understøttelsen

| Fil | Ændring |
|---|---|
| `lib/sync/config.ts` | Sektionstypen `document` fjernes. Feltet `category` på guide-sektioner fjernes også, fordi ingen kode bruger det |
| `lib/sync/sync.ts` | `pdf`-typen, `fetchPdf`, `verifyPdf` og PDF-delen af `readSection` fjernes |
| `lib/sync/content.ts` | `documentMetaSchema`, `serializeMeta` og `MAX_PDF_BYTES` fjernes. `digest` og `imageFormat` bevares til billeder |
| `lib/sync/drive.ts`, `lib/google/client.ts`, `lib/google/env.ts` | `downloadPdf` og `PDF`-konstanten fjernes fra `DriveSource` og klienten |
| `lib/site/load.ts`, `src/content.config.ts`, `src/pages/[section]/[slug].astro` | Dokument-elementer og downloadlinks fjernes |
| **Ny regel i sync:** `content/` må kun indeholde konfigurerede sektioner, `_slugs.json` og `_redirects.json` | En sektion, der fjernes fra konfigurationen, fjernes også fra `content/` ved næste sync, og indholdet rapporteres som fjernet. Build afviser ukendte filer og mapper i `content/` |
| `tests/sync.test.ts`, `tests/build.test.ts`, `tests/run.test.ts`, `tests/drive-client.test.ts`, `tests/helpers/fake-drive.ts` | Testene, der brugte PDF'er som eksempel på generelle regler, skrives om til Google Docs. Hver eksisterende regel bevarer en test: genveje, fjernelse, omdøbning, flytning, kollisioner, listefejl, papirkurv, ingen adgang, dobbelt mål og masseudtagning |

**Testkriterier:**
1. Konfigurationen afviser `type: "document"`.
2. En PDF i en sektionsmappe publiceres ikke og giver advarslen "Filtypen application/pdf accepteres ikke".
3. Når `dokumenter` fjernes fra konfigurationen, forsvinder `content/dokumenter/` ved næste sync og står som fjernet i rapporten. `_slugs.json` beholder posten, og `_redirects.json` røres ikke.
4. Build afviser en ukendt mappe i `content/`.
5. Alle regler fra fase 2a er fortsat dækket af en test, nu med Docs.

### 5b — Nye sektioner, forside og sidefod

| Fil | Ændring |
|---|---|
| `config/site.json` | Sektionerne `om-groendalsvaenge`, `bo-her`, `faellesskab`, `foreningen` og `nyheder`, i denne rækkefølge, som også er navigationens. `dokumenter` og `vejledninger` kommer på listen over ignorerede mapper, indtil de er ryddet op i Drive. Et valgfrit `links.probo` (https) |
| `lib/site/sections.ts` | Titler og introtekster for de fem sektioner |
| `lib/site/frontpage.ts` | Ny: forsidens genveje og sidefodens links som en liste af `{ label, path }` i koden. En sti, der ikke findes endnu, udelades med en advarsel ved build, ligesom manuelle redirects. Startlisten bygger på analysen: Kontakt, Sådan får du et hus, Sælg dit hus, Planlægger du at bygge?, Forsikringsskader, Affald og renovation |
| `src/pages/index.astro`, `src/layouts/Base.astro` | Forsiden får en introduktion, genveje, de tre seneste nyheder og en oversigt over sektionerne. Sidefoden får kontakt og ProBo, hvis ProBo er konfigureret |
| `tests/site.test.ts`, `tests/build.test.ts` | Tests af genveje, sidefod og nyheder på forsiden |

**Testkriterier:**
1. Navigationen følger konfigurationens rækkefølge.
2. En genvej til en side, der ikke findes, udelades med en advarsel og stopper ikke buildet.
3. Forsiden viser højst tre nyheder, og kun dem, der er synlige på build-dagen.
4. ProBo-linket vises kun, når det er konfigureret, og kun som https.
5. Outputkontrollen består uændret: default deny, ingen Drive-ID'er og ingen scripts.

### 5c — Redirects fra WordPress

| Fil | Ændring |
|---|---|
| `content/_redirects.json` | Den manuelle liste med alle WordPress-adresser fra analysen, der lever videre, peger på den nye adresse. Sider, der er flyttet til ProBo, peger på `/foreningen/regler-og-dokumenter/`. Det samme gør POC'ens `/dokumenter/vedtaegter-paragraf-3-nyt-design/`. Sider, der udgår, får ingen redirect og giver 404 |
| `docs/indholdsanalyse.md` | Kolonne med den nye adresse |

De nye adresser er forudsagt ud fra de foreslåede titler, fx "Sådan får du et hus" → `/om-groendalsvaenge/saadan-faar-du-et-hus/`. Indtil en side findes, springes redirectet over med en advarsel. Listen kan derfor skrives nu og aktiveres efterhånden, som siderne oprettes. Får en side en anden titel, rettes listen, og advarslen viser hvor.

**Testkriterier:**
1. Listen valideres: kun stier i mappeform og ingen redirect over en eksisterende side.
2. Integrationstesten viser, at et WordPress-redirect bliver en side, når målet findes, og at det giver en advarsel, når målet mangler.

### 5d — Ændringer i Drive (kræver særskilt godkendelse)

Ikke kode. Udføres kun efter udtrykkelig godkendelse:

1. Opret mapperne `om-groendalsvaenge`, `bo-her` og `faellesskab` i fællesdrevet.
2. Testdokumenterne flyttes eller fjernes efter brugerens valg: `vejledninger/vejledning` og `fase1-test`, `foreningen/foreningen` samt "nyhed 1" og "nyhed 2" i `nyheder/`. Mapperne `dokumenter` og `vejledninger` kan derefter slettes af en administrator.
3. Eventuelt: Jeg laver udkast til de ca. 22 sider som Google Docs ud fra WordPress-teksterne og lægger dem i de rigtige mapper. Redaktørerne gennemser og retter dem, før de publiceres. Det sker i praksis ved, at de bliver liggende i mappen.

## Risici

- **Omskrivningen af 2a-testene fra PDF til Docs** kan tabe en regel undervejs. Imødegås ved en tabel i fasens resultat, der knytter hver gammel test til den nye.
- **Den nye oprydningsregel i sync** sletter alt i `content/`, der ikke hører til en konfigureret sektion. Konfigurationen styres af en udvikler, og Git bevarer det slettede. Rapporten nævner hver fjernet fil.
- **Forudsagte adresser** i redirect-listen kan ramme forkert, hvis titlerne ændres. Konsekvensen er en advarsel ved build, ikke et forkert redirect.
- **PDF-understøttelsen kan genskabes fra Git** (fase 2a, commit `dd4e296`), hvis behovet opstår igen.
- **Uden `links.probo` viser sidefoden intet ProBo-link.** Adressen skal oplyses, før sitet går "softlive".

## Resultat for 5a (22. oktober 2026)

- **Tests og build:** 85 tests består. Typekontrollen giver 0 fejl, advarsler og hints. Et rigtigt build består outputkontrollen med 4 sider og ingen PDF'er.
- **Fjernet:** sektionstypen `document`, feltet `category`, `fetchPdf`, `verifyPdf`, `documentMetaSchema`, `serializeMeta`, `MAX_PDF_BYTES`, `downloadPdf` (klient, `DriveSource`, `FakeDrive`) og dokumentvisningen på sitet. Desuden `hashSchema` og `report.skippedSections`, som ikke længere havde nogen brugere.
- **Ny regel:** Sync fjerner mapper og filer i `content/`, der ikke hører til en konfigureret sektion, og rapporterer dem som fjernede. Build afviser dem.
- **`content/dokumenter/` er fjernet med `git rm`.** Tokenet fra 21. oktober var udløbet (HTTP 401), så sync kunne ikke køre. Resultatet er det samme, som sync ville give. Posten i `_slugs.json` er bevaret.
- **Undervejs:** `.build/lock` fra 21. oktober kl. 22:57 blev fjernet igen, efter kontrol af at ingen proces holdt den.

**Hvor de gamle regler nu testes** (alle i `tests/sync.test.ts`, nu med Google Docs i stedet for PDF):

| Regel fra fase 2a | Test |
|---|---|
| Kun direkte filer i sektioner, canaries i rod, `redaktion`, undermappe og intern mappe | "kun filer direkte i en sektionsmappe publiceres" (nu også: en PDF giver en advarsel) |
| Genvej: målets indhold og ID, genvejens navn | "genvej publicerer målets indhold …" |
| Fjernet genvej, slug bevares | "fjernet genvej fjerner siden …" |
| Omdøbning og flytning | "omdøbning bevarer URL …" |
| `setSlug` og `slugify` | "manuelt ændret slug …" (uændret) |
| Slug-kollision, returnerende dokument | To tests, uændrede regler |
| Genvej til mappe, ingen adgang, dobbelt mål | "genvej til mappe, genvej uden adgang …" |
| Fejl i listning eller manglende sektion | "fejl i listning …" |
| Sidste gyldige version | "ulæseligt mål, fejlet hentning og ugyldigt dokument …". Den ugyldige PDF er erstattet af et dokument med to faner |
| Papirkurv, masseudtagning, `updatedAt` | Tre tests, uændrede regler |
| Håndrettet `_slugs.json` | "to aktive sider med samme adresse …" |
| Andre filer bevares | Erstattet af "en sektion, der fjernes fra konfigurationen, og løse filer ryddes op; `_redirects.json` bevares" |

## Resultat for 5b (22. oktober 2026)

- **Tests og typekontrol:** 86 tests består, og typekontrollen giver 0 fejl, advarsler og hints. Integrationstesten viser:
  - Forsiden har kun genveje til sider, der findes, og advarer om resten.
  - Kun de tre seneste nyheder vises på forsiden, mens den fjerde står på `/nyheder/`.
  - Sidefoden linker til Kontakt.
  - Navigationen følger konfigurationens rækkefølge.

  `site.test` dækker ProBo: Linket vises kun med https, og ukendte link-nøgler afvises.
- **Konfiguration:** `config/site.json` har de fem sektioner. `dokumenter` og `vejledninger` står som ignorerede mapper, og `links` er tom, indtil ProBo-adressen kendes.
- **`content/vejledninger/` er fjernet med `git rm`,** ligesom `content/dokumenter/` i 5a. Tokenet er udløbet.
- **Visuelt tjek:** Forsiden er set i brugerens kørende dev-server (port 4321). Navigationen viser de fem sektioner, "Seneste nyt" viser de to testnyheder, og "Find rundt" viser de fire sektioner. "Det vigtigste" og sidefodens links vises ikke endnu, fordi siderne ikke findes.
- **Ikke kørt:** Et rigtigt `bun run build` i arbejdsmappen, fordi brugerens dev-server holder `.build/lock`. Integrationstestens fulde build dækker det.
- **Live-sync virker først efter 5d.** Sync stopper med "Sektionsmappen "om-groendalsvaenge" mangler i roden", indtil de tre mapper er oprettet i Drive. Det er den tilsigtede sikkerhed mod omdøbte eller slettede mapper.

## Åbne punkter, der ikke blokerer planen

- ProBo-adressen og hvem der har adgang. Kræves til 5b, men kan tilføjes senere i konfigurationen.
- Husorden: "kort fortalt" og ProBo, eller kun ProBo. Det er en indholdsbeslutning, som ikke påvirker koden.
