# Mappemodellen — fase 2d: fjern godkendelsesmekanikken

Sidste leverance i fase 2. Planen kræver et separat commit, efter at den nye vej virker (fase 2c). Efter 2c bruger build og dev ikke længere snapshots, godkendelser, manifest, mockadapter eller pilot-scripts. De fjernes nu sammen med deres tests og fixtures. Projektets regler (`AGENTS.md`) og dokumentation opdateres til mappemodellen.

## Mål

Repository'et indeholder kun den kode, mappemodellen bruger. Det, der bevares fra den gamle kode, er:

- Docs-parseren
- blokkontrakten
- Google-klientens sikre GET'er
- billedsignaturerne
- sikkerhedstestene af klient og parser

`AGENTS.md` beskriver de nye grundregler. De gamle dokumenter markeres som historiske.

## Filer

| Fjernes | Begrundelse |
|---|---|
| `fixtures/` (candidates, snapshots, approvals, manifest, assets) | Godkendelses- og mockdata. Bruges ikke længere |
| `lib/adapters/content-adapter.ts`, `mock.ts`, `google.ts` | Pilotens adapterkontrakt. Erstattet af `DriveSource` |
| `lib/publication/store.ts`, `prepare-pilot.ts`, `pilot-review.ts` | Snapshots, godkendelser og review-HTML |
| `lib/site/markdown.ts`, `lib/site/blocks.ts` | Gamle renderere. Erstattet af `lib/site/render.ts` |
| `lib/contracts/content.ts` | Den gamle `ContentRecord`, hash-godkendelse og `sealRecord`. `digest` og `hashSchema` flyttes til `lib/sync/content.ts` |
| `scripts/prepare-content.ts`, `google-prepare.ts`, `google-prepare-capture.ts`, `create-fixtures.ts`, `use-realistic-content.ts`, `mock-guides.ts` | Pilot- og fixture-vedligeholdelse |
| `config/google-pilot.example.json` | Pilotindeks |
| `tests/contracts.test.ts`, `publication.test.ts`, `markdown.test.ts`, `google-adapter.test.ts`, `helpers/adapter-contract.ts` | Tests af fjernet kode. Sikkerhedstestene af klient og parser flyttes (se nedenfor) |

| Ændres | Ændring |
|---|---|
| `lib/adapters/google/client.ts` → `lib/google/client.ts` | `GoogleReader`, `metadata()` og `document()` (som brugte `SUGGESTIONS_INLINE`) fjernes. Tilbage er `listFolder`, `getFile`, `downloadPdf`, `readDocument` og `downloadImage` |
| `lib/adapters/google/blocks.ts` → `lib/google/docs.ts` | Accepterer kun `PREVIEW_WITHOUT_SUGGESTIONS`. Fejltekster uden "piloten" |
| `lib/publication/assets.ts` | `imageFormat` flyttes til `lib/sync/content.ts`. Filen fjernes |
| `tests/docs-parser.test.ts` | Ny: parserens afvisninger (forslag, faner, flettede celler, nummererede lister, forankrede billeder, usikre links, sidehoveder), flyttet fra `google-adapter.test.ts` |
| `tests/drive-client.test.ts` | Får de flyttede sikkerhedstests: ingen token i fejl, billeder uden token og kun fra Googles værter, størrelsesgrænse, ugyldigt JSON |
| `tests/fixtures/google-document.json` | Bevares som parser-fixture med `PREVIEW_WITHOUT_SUGGESTIONS` |
| `package.json` | Scripts `content:prepare`, `google:prepare` og `google:prepare-capture` fjernes |
| `AGENTS.md` | Punkt 4–7 erstattes med ordlyden fra fase 0 (godkendt med planen) |
| `README.md` | Omskrives til sync → content → build |
| `docs/architecture-v1.md`, `implementation-plan.md`, `poc-decisions.md`, `google-pilot.md`, `local-pilot-approval.md`, `mock-content-sources.md` | Får en note øverst om, at de er historiske |

## Testkriterier

1. `bun test`, typekontrollen og `bun run build` består uden den fjernede kode.
2. Ingen tilbageværende import af `contracts/content`, `adapters`, `publication`, `site/markdown` eller `site/blocks`.
3. Klientens sikkerhedstests og parserens afvisningstests findes fortsat og består.
4. Det byggede `dist` er byte-identisk med buildet fra 2c på det samme `content/`.
5. `rg -i "approval|snapshot|manifest|sealRecord"` finder kun historiske docs.

## Risici

- **En sikkerhedstest kan gå tabt i oprydningen.** Hver fjernet test er gennemgået. Testene af kode, der bevares, flyttes. Testene af kode, der fjernes, udgår med den.
- **Historikken forsvinder ikke.** Pilotens snapshots og godkendelser findes i Git-historikken (commit `8458a27` og tidligere) og i `docs/local-pilot-approval.md`.
- **`.local/google-pilot/`** ligger uden for Git og røres ikke.

## Resultat 21. oktober 2026

1. **Tests, typekontrol og build:** 67 tests består. Før fase 2d var der 94. De fjernede tests testede selve godkendelseskoden. Typekontrollen giver 0 fejl, advarsler og hints. `bun run build` består outputkontrollen, og `bun install --frozen-lockfile` ændrer intet.
2. **Ingen gamle imports:** Der er ingen imports af `contracts/content`, `adapters`, `publication`, `site/markdown` eller `site/blocks` tilbage. `lib/adapters/` og `lib/publication/` findes ikke længere.
3. **Sikkerhedstests bevaret:**
   - Parserens afvisninger ligger i `tests/docs-parser.test.ts`: 11 tilfælde, nu også flettede celler, indrykkede lister, forkert dokument-ID og visningen `SUGGESTIONS_INLINE`.
   - Klientens tests ligger i `tests/drive-client.test.ts`: ingen token eller svartekst i fejl, billeder uden token og kun fra Googles værter, størrelsesgrænser og ugyldigt JSON.
4. **Uændret output:** `dist` er byte-identisk med buildet fra 2c (11 filer) på samme `content/`.
5. **Ingen gamle begreber i koden:** `approval`, `snapshot`, `manifest` og `sealRecord` findes kun i dokumentationen.

**Afvigelser:**
- `AGENTS.md` punkt 1 og 2 henviste til de gamle dokumenter og til "versionsbundet godkendelse". De er rettet til mappemodellen ud over den godkendte ordlyd for punkt 4–7.
- Parserens fejltekster nævner ikke længere "piloten".
- En tidligere bemærkning om forslag ("løs forslag før import") er erstattet af "svaret indeholder forslag; dokumentet publiceres ikke", fordi forslag nu udelades i stedet for at blive afvist.
