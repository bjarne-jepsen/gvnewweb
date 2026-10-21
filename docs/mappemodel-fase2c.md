# Mappemodellen — fase 2c: Astro bygger fra content/

Tredje leverance i fase 2. Efter 2a og 2b skriver sync PDF'er og Markdown til `content/`. Nu bygger Astro hjemmesiden alene derfra. Den gamle godkendelsesmekanik (snapshots, approvals, manifest, mockadapter) bruges ikke længere af build eller dev. Selve koden fjernes i et separat commit i fase 2d.

## Mål

`bun run build` og `bun run dev` læser kun `content/` og `config/site.json`. Hver fil i en sektion bliver en side på `/<sektion>/<slug>/`. PDF'er ligger på `/<sektion>/<slug>.pdf` med uændrede bytes, og billeder på `/<sektion>/<slug>/<fil>`. Gamle stier fra `previousPaths` og fra den manuelle `content/_redirects.json` bliver redirect-sider. Sitemap og søgeindeks dannes af præcis de samme sider. Outputkontrollen bevarer default deny.

## Filer

| Fil | Ændring |
|---|---|
| `lib/site/load.ts` | Ny: læser og validerer `content/` med sync-motorens læser, slår slugs op og danner sider, dokumenter, filer og redirects. Bruges både af Astro og af build-scriptet, så de ser samme datasæt |
| `lib/site/render.ts` | Ny: egen mdast→HTML-rendering af den tilladte dialekt. Alt escapes, og ukendte noder kaster |
| `lib/site/sections.ts` | Ny: navigation og tekster pr. sektion. Navigationen ligger i koden, som planen siger |
| `lib/sync/sync.ts` | Eksporterer læseren af `content/` (`readContent`) |
| `src/content.config.ts` | Ny: collections `pages`, `documents` og `redirects` med inline-loadere og Zod-skemaer |
| `src/pages/**`, `src/components/Entries.astro`, `src/layouts/Base.astro` | Omskrives til sektionsruter, detaljesider, redirect-sider, sitemap og søgeindeks fra collections |
| `lib/site/content.ts`, `lib/site/markdown.ts`, `lib/site/blocks.ts` | `content.ts` fjernes. De to andre bliver liggende til fase 2d, fordi pilotens review-HTML stadig bruger dem |
| `scripts/build.ts`, `scripts/verify-output.ts` | Bygger fra `loadSite` og kontrollerer output mod det samme datasæt |
| `tests/site.test.ts`, `tests/build.test.ts` | Nye tests af loader og renderer. Integrationstesten omskrives til sync med `FakeDrive` → build |

**Afvigelse fra fase 2b:** I stedet for en remark-regel i Astros Markdown-pipeline renderer siden Markdown med sin egen renderer, som kun kender den tilladte dialekt. Astros pipeline sender rå HTML videre og vil optimere billeder med sharp. Den egen renderer gør begge dele umulige og holder billedernes bytes uændrede.

## Testkriterier

1. En fil uden for sektionsmapperne kommer aldrig i `dist`, sitemap eller søgeindeks. Testen bruger en canary i Drive, der går gennem sync og build.
2. En genvej publicerer målets indhold med genvejens navn som titel på siden.
3. En fjernet genvej fjerner siden, dens PDF og dens billeder fra `dist`.
4. En omdøbning bevarer URL'en og ændrer titlen.
5. Et manuelt ændret slug giver en redirect-side fra den gamle sti. Den gamle sti er ikke i sitemap.
6. Manuelle redirects i `_redirects.json` virker. Et redirect til en side, der ikke findes, springes over med en advarsel. Et redirect fra en sti, der er en rigtig side, stopper buildet.
7. Ugyldigt indhold, fx rå HTML i en `.md` rettet i hånden, stopper buildet. Sidste gyldige `dist` bevares.
8. PDF- og billedbytes i `dist` er identiske med `content/`. Ingen Drive-ID'er og ingen `<script` i output. Kun forventede filer findes.
9. Hele testsuiten, typekontrollen og et rigtigt `bun run build` består.

## Risici

- **Det gamle mockindhold forsvinder fra sitet.** Opslag, kalender og de seks bearbejdede vejledninger ligger ikke i `content/`. Det er planlagt (fase 0, antagelser). Sitet viser kun det, der er synkroniseret fra Drive.
- **Content layer cacher data i `.astro/`.** I dev kræver ændringer i `content/` en genstart, ligesom i dag.
- **`bun run build` kræver, at brugerens dev-server er stoppet.** Den holder `.build/lock`.
- **Redirect-sider** er meta-refresh. Rigtige 301'ere kræver hosting (senere).

## Resultat 21. oktober 2026

- **Tests:** 94 består. Integrationstesten (`tests/build.test.ts`) kører hele kæden fra sync med `FakeDrive` til build seks gange og dækker testkriterie 1–8. Den indeholder canaries i `redaktion/`, i roden og i en intern mappe, og ingen af dem når `dist`. `tests/site.test.ts` dækker renderer og loader. Typekontrollen giver 0 fejl, advarsler og hints.
- **Rigtigt build** på det synkroniserede indhold: 7 HTML-sider (forside, 3 sektioner, 3 sider), `search.json`, `sitemap.xml` og 1 PDF på `/dokumenter/vedtaegter-paragraf-3-nyt-design.pdf`. Outputkontrollen består.
- **Kendt støj:** Når der ingen redirects er, skriver Astro "The collection "redirects" does not exist or is empty". Det er uskadeligt.
- **Undervejs:** Brugerens dev-server efterlod `.build/lock` fra 21:52. Den blev fjernet, efter at det var kontrolleret, at ingen proces holdt den.
- **Ikke gjort:**
  - Ingen visuel gennemgang i browseren af de nye sider. De bruger det eksisterende layout.
  - Den gamle godkendelseskode og dens tests ligger stadig i repository'et, men bruges ikke af build og dev. Den fjernes i fase 2d.
