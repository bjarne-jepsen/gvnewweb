# POC — beslutninger og afgrænsning

> **Historisk.** Dette dokument beskriver den tidligere model med versionsgodkendelse og snapshots. Den er erstattet af mappemodellen (`docs/mappemodel-fase0.md` til `docs/mappemodel-fase2d.md`) og fjernet fra koden i fase 2d (21. oktober 2026).

Discovery-planen blev godkendt 20. oktober 2026. Dette dokument præciserer implementeringen i forhold til det oprindelige v1-oplæg.

## Kontrakt

Alle fire ContentRecord-typer implementeres som en strict Zod-union. Ukendte felter og synlighedsværdier afvises. Kategorien er i POC en eksplicit taksonomi: Foreningen, Bolig og vedligehold, Fællesskab. ID og slug begrænses til små ASCII-bogstaver, tal og bindestreger; slug er unik inden for typen.

Document.file er udvidet med `assetHash` og `sizeBytes`. Hashpayloaden er hele den validerede record bortset fra `source`, `contentHash` og `file.assetPath`. Dokumentets filbytes bindes transitivt gennem `assetHash`; filhash og størrelse verificeres ved preparation og hver publicering. `updatedAt` er offentligt og hashes. En flyttet kildefil eller skift af provider ændrer ikke publiceringsversionen.

Mockadapteren læser allerede normaliserede records inklusive hash. `sealRecord` er den fælles normaliserings-/hashfunktion for kommende adaptere; `normalizeRecord` validerer og genberegner til sammenligning. Fejl identificerer fixture, index, indholds-ID og Zod-feltsti. Alle fejl stopper nyt build.

## Publicering

Manifestet udpeger præcise prepared snapshots. Disse er det versionsstyrede published release-input; en ekstra kopi til en separat published-mappe ville ikke tilføre integritet. Sidste beslutning pr. ID skal matche manifestets hash. Ved withdraw udelades ID'et uden fallback. Ved modstridende eller manglende beslutninger fejler build. Snapshotfiler oprettes eksklusivt og overskrives aldrig af prepare; ændrede bytes opdages ved genvalidering.

Snapshots og register er betroede, lokalt vedligeholdte build-inputs. POC implementerer ikke autentifikation af godkender eller kryptografisk signatur af registret. Menneskelig Workspace-godkendelse skal senere knyttes til netop den version, som reviewes; adgang til registeret kræver da særskilt kontrol.

Candidate-ændringer, herunder ændret synlighed, ændrer ikke et allerede publiceret snapshot. Privatmarkering i kilde er ikke en tilbagekaldelsesmekanisme. Tilbagetrækning er en eksplicit registerbeslutning og træder i kraft ved næste release.

## Offentligt output

Det offentlige datasæt fjerner provenance og interne filstier og danner alle sider, sitemap og søgeindeks. Downloadfiler får SHA-256-baserede URL'er. Kun refererede, offentlige og versionsgodkendte PDF'er kopieres. Relationer skal være gyldige i det faktisk valgte offentlige datasæt.

Build bruger staging og outputkontrol før lokal promotion af `dist`, med rollback ved rename-fejl. Build og dev beskyttes mod samtidig kørsel af en eksklusiv lokal lås. Produktionsatomaritet, servercache og fjernelse af historiske URL'er hos en host er ikke testet. Første POC deployer ikke noget.

## Visninger

Forside, fire indholdsoversigter og fire detaljer viser det illustrative datasæt. Dokumentet kan downloades fra sin egen detaljeside. Ekstra oversigter for opslag og kalender gør de eksisterende fire typer synlige uden yderligere integration. Alt indhold markeres som mockdata; ingen foreningsregler eller faktiske arrangementer opfindes.

Designet er et enkelt, responsivt læselayout og fastlægger ingen endelig visuel identitet. POC har ingen søgegrænseflade; `search.json` validerer kun den sikre indeksgenerering. Preview af prepared indhold er filbaseret, ikke et redaktionelt UI.

## Gennemgang ved gate 2

Versions- og privacy-tests kontrollerer, at en ny candidate aldrig erstatter et godkendt snapshot, at dokumentbytes er versionsbundne, at private godkendelser afvises, og at tilbagekaldelse fjerner både record og fil. Før frontend blev tilføjet bestod 19 tests og TypeScript-kontrol.

## Før integration eller produktion

Beslut godkendelses-UI og rettigheder, hvilke dokumenter der må offentliggøres, publiceringsfrekvens, håndtering af kalendergentagelser, rigtigt domæne og en deploymentmodel med testet release-skift/rollback og fjernelse af tilbagekaldte filer. Google-adapteren skal bestå samme kontrakttests som mockadapteren; frontend skal fortsat kun læse snapshots.

## Afsluttende verifikation

- 21 tests består, inklusive isoleret integrationstest med flere fulde Astro-builds.
- Astro check og TypeScript: 0 fejl, 0 advarsler, 0 hints.
- `bun install --frozen-lockfile` og `bun run build` består.
- Efter udvidelsen med kildebaseret prøveindhold genereres 15 statiske sider, ét søgeindeks, ét sitemap og én verificeret PDF fra ti offentlige snapshots.
- Den mekaniske UI-kontrol gav ingen fund. Læselayoutet er visuelt gennemset i smal og bred browservisning; der er ikke udført en fuld WCAG-audit.
