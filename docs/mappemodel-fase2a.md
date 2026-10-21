# Mappemodellen — fase 2a: PDF-synkronisering, genveje og slugs

Første leverance i fase 2 (se `mappemodel-fase0.md`, afsnit 7). Den indeholder ingen Docs-konvertering (fase 2b), ingen Astro-ændringer (fase 2c) og fjerner ikke godkendelsesmekanikken (fase 2d). Den gamle pipeline fortsætter uændret, til fase 2c.

## Mål

`bun run sync` læser sektionsmapperne i fællesdrevet og skriver de offentlige PDF'er til `content/` med stabile slugs og en rapport. Alt bevises med en falsk Drive i tests. Ingen ændring i Drive, ingen commit og ingen netværk i CI.

## Filer

| Fil | Ændring |
|---|---|
| `config/site.json` | Ny: rod-ID og sektioner, Zod-valideret |
| `lib/sync/config.ts` | Ny: skema for konfigurationen |
| `lib/sync/drive.ts` | Ny: `DriveItem`-skema, `DriveSource`-interface, `DriveAccessError` |
| `lib/sync/slugs.ts` | Ny: `slugify`, skema for `_slugs.json`, tildeling, flytning mellem sektioner og manuel `setSlug` |
| `lib/sync/sync.ts` | Ny: sync-motoren (listning, genveje, PDF'er, staging, atomisk ombytning, sikring mod masseudtagning, rapport) |
| `lib/sync/report.ts` | Ny: rapport som JSON og Markdown |
| `lib/adapters/google/client.ts` | Udvides: `listFolder` (paginering, `incompleteSearch` afvises), `getFile` (med `shortcutDetails`, papirkurv) og `GoogleHttpError` med status. Eksisterende metoder er uændrede |
| `scripts/sync.ts` | Ny CLI. Token fra `GOOGLE_ACCESS_TOKEN_FILE`. `--allow-mass-removal` |
| `scripts/slug.ts` | Ny CLI: `bun run slug -- <id> <nyt-slug>` flytter den gamle sti til `previousPaths` |
| `tests/helpers/fake-drive.ts`, `tests/sync.test.ts`, `tests/drive-client.test.ts` | Nye tests |
| `package.json`, `.gitignore` | Scripts `sync` og `slug`. `.sync/` ignoreres |

## Testkriterier

1. En fil uden for sektionsmapperne (i roden, i `redaktion/` eller i en undermappe) kommer aldrig i `content/`. Roden og undermapper giver advarsler.
2. En genvej publicerer målfilens bytes med målfilens ID og genvejens navn som titel.
3. En fjernet genvej sletter både PDF og metadata og rapporteres som fjernet.
4. En omdøbning bevarer slug'et. En flytning til en anden sektion giver en `previousPaths`-post.
5. `setSlug` flytter det gamle slug til `previousPaths` og afviser kollisioner.
6. Slug-kollisioner, ukendte filtyper, undermapper og genveje til mapper rapporteres og publiceres ikke.
7. En fejlet eller ufuldstændig listning, eller en manglende sektionsmappe, ændrer intet i `content/`.
8. Et mål, der ikke kan læses, og en download, der fejler eller er ugyldig, beholder sidste gyldige version og giver en fejl. Det gælder også et mål, der optræder to gange.
9. Et mål i papirkurven fjernes og giver en advarsel.
10. Fjerner en kørsel mere end halvdelen af en sektion (og mindst to filer), stopper den uden ændringer, medmindre `allowMassRemoval` er sat.
11. `updatedAt` ændrer sig kun, når bytes eller titel ændrer sig. En ny kørsel uden ændringer giver byte-identiske filer og en tom ændringsliste.
12. Klienten paginerer, afviser `incompleteSearch`, sender kun GET og afslører ikke tokenet i fejl. Et 404-svar bliver til `DriveAccessError`.
13. Hele den eksisterende testsuite, typekontrollen og buildet består uændret.

## Risici

- **Den rigtige Drive afviger fra den falske**, fx i felter for genveje eller paginering i fællesdrev. Det imødegås af klienttests mod svar formet efter API-dokumentationen. Afprøves live, når tokenet er der.
- **Et 404-svar betyder både "findes ikke" og "ingen adgang".** Begge behandles som manglende adgang: fejl, og sidste version beholdes. Kun et eksplicit `trashed: true` betyder fjernelse.
- **Når `content/` byttes, kan en proces stoppe halvvejs.** Indholdet ligger da i `.sync/previous`, og Git kan gendanne det. Sync bruger en eksklusiv lås ligesom build.
- **`content/` og testdokumentet `fase1-test`:** 2a læser kun `dokumenter/`, så testdokumentet berøres ikke endnu. Det skal fjernes eller flyttes, før fase 2b køres live.

## Resultat 21. oktober 2026

- **Tests:** 62 består, heraf 19 nye (15 i `tests/sync.test.ts` og 4 i `tests/drive-client.test.ts`). Typekontrollen giver 0 fejl, advarsler og hints. Det eksisterende build består outputkontrollen uændret: 12 snapshots, 3 filer.
- **Fejl fundet ved gennemlæsning:** Et fjernet dokument, der vendte tilbage til en adresse, som i mellemtiden var overtaget, stoppede hele kørslen. Nu giver det en fejl for det ene dokument, og der er tilføjet en test af tilfældet.
- **Afvigelser fra planen:**
  - Sektionsmapperne findes efter navn i roden, som foreslået i fase 0.
  - Sync returnerer exit-kode 2, når enkelte filer fejler. `content/` er da stadig opdateret, men koden gør det muligt for en kommende planlagt kørsel at opdage rapporten.
  - Masseudtagning kræver mindst to fjernede filer, så det altid er muligt at fjerne en enkelt fil.
- **Ikke afprøvet live.** `bun run sync` er ikke kørt mod fællesdrevet, og `content/` findes ikke i repository'et endnu. Det afventer tokenet. En kørsel vil kun skrive `dokumenter/` (i dag én PDF) og `_slugs.json`. Den rører ikke Drive og committer intet.
- Den stale `.build/lock` fra 20. oktober kl. 17:46 er fjernet. Der kørte ingen build- eller dev-proces.
