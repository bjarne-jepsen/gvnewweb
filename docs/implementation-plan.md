# Discovery og implementeringsplan — første POC

## Formål

Bevis, at en statisk frontend kan publicere **versionsbundet, godkendt** indhold fra normaliserede mockdata. En senere Google Workspace-adapter skal kunne levere nøjagtig den samme kontrakt uden ændringer i frontend.

**Status:** Den oprindelige POC-plan er godkendt og implementeret. Dokumentet bevarer det oprindelige faseforløb. Den efterfølgende Google-pilot med manuel snapshotgodkendelse og understøttelse af tabeller/billeder er særskilt godkendt og dokumenteret i `docs/google-pilot.md`.

## Første Codex-opgave: discovery (ingen applikationskode)

1. Revider `docs/architecture-v1.md`. Kontrollér identitet og slug, kalenderens tidszoner og datoer, dokumentassets, `contentHash` og præcis hvilke felter/bytes der indgår i den kanoniske hash.
2. Vurder snapshot-modellen. Godkendt `id + contentHash` må aldrig udvælge en nyere candidate med samme ID; den publicerede version og dens dokumentfiler skal fastholdes.
3. Definér en enkel datakildeneutral grænseflade og fejlmodel. Google-specifikke rådata skal holdes ude af frontend.
4. Afklar output- og privacy-regler: filtrering gælder HTML, offentlige assets, JSON, sitemap, søgeindeks og eventuelle prerenderede mellemprodukter.
5. Beskriv en minimal reproducerbar `bun install`, test- og build-workflow. En fejlende build må ikke føre til deployment.
6. Returnér de tre vigtigste designfindings, eventuelle ændringsforslag og en prioriteret implementeringsplan. **Stop derefter til godkendelse.**

## Foreslåede leverancer efter godkendelse

### Milestone 1 — Contracts og fixtures
- TypeScript/Zod discriminated union for `document`, `guide`, `notice`, `event`.
- Repræsentative JSON-fixtures med public, members og board samt både gyldige og ugyldige cases.
- Deterministisk SHA-256 over defineret, kanoniseret publiceringspayload med tests for objektnøglers rækkefølge.
- En mock-adapter returnerer validerede records; fremtidig Google-adapter skal bestå samme kontrakttests.

### Milestone 2 — Versionsbundet publicering
- Prepared og published snapshots samt versionsspecifik godkendelse på `id + contentHash`.
- Ændring af ikke-godkendt candidate ændrer **ikke** publiceret output.
- Ændret indhold kan først publiceres efter ny preparation og eksplicit versiongodkendelse.
- Godkendte dokumentassets fastholdes sammen med snapshot.
- Negative tests: ukendt visibility, manglende godkendelse, ufuldstændige referencer, tilbagekaldelse og mismatch i hash.

### Milestone 3 — Statisk Astro-prototype
- Forside, dokumentoversigt og vejledningsside bygget udelukkende af publicerede snapshots.
- Genbrugelige præsentationskomponenter uden kildesystem-specifik kode.
- Responsivt, tilgængeligt grunddesign uden at foregribe endelig visuel identitet.

### Milestone 4 — Build- og driftstest
- Reproducerbar lokal start, `bun test` og `bun run build`.
- Kontrol af `dist` for ikke-publicerede ID'er, tekst, filnavne og dokumentassets.
- Drift/overdragelsesvejledning, som kan følges af en anden person end udvikleren.
- Ingen deployment til Simply.com i første POC; distribution designes efter sikkerhedsgennemgang.

## Acceptkriterier for POC

1. Ét indholdselement kan ændres i mockdatas candidate uden ændring af offentlig build.
2. Publiceret version ændres først ved gyldig godkendelse af den eksakte prepared-version.
3. En vejledning og dokumentoversigt kan vises fra den fælles datakontrakt.
4. Upubliceret eller adgangsbegrænset indhold og dets assets findes ikke i statisk output.
5. Hashvalidering opdager ændring i godkendt indhold og filer.
6. En fejl i data eller build fører til ingen ny deployment.
7. Modellen kræver ikke runtime-adgang til Google Workspace.
8. Et andet bestyrelsesmedlem kan følge dokumenteret indholds- og build-proces.

## Beslutningsporte

- **Gate 1:** Godkend Codex' discovery-rapport og korrigeret plan **før applikationskode**.
- **Gate 2:** Gennemgå versionsinvarians og privacy-tests efter milestone 2.
- **Gate 3:** Vurdér POC'en før beslutning om Google Workspace-integration og Simply.com-deployment.

## Ikke i POC

Login, privat medlemsunivers, realtime-opdateringer, Google API/credentials, live kalenderimport, WordPress-migrering, produktionsdomæne, integration til Foreningsassistenten og egentligt redaktionelt godkendelses-UI.

## Codex startinstruktion

Læs `AGENTS.md`, `docs/architecture-v1.md` og dette dokument. Udfør kun discovery-fasen. Brug de eksisterende datakontrakter som udgangspunkt, identificér væsentlige risici og stop til godkendelse før implementation.
