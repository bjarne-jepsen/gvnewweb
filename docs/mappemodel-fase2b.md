# Mappemodellen — fase 2b: Google Docs til Markdown

Anden leverance i fase 2. Den bygger på fase 2a (sync af PDF'er) og på anbefalingen fra fase 1: Docs API med `PREVIEW_WITHOUT_SUGGESTIONS` → den eksisterende parser → en egen Markdown-serializer. Astro læser endnu ikke fra `content/`; det sker i fase 2c.

## Mål

`bun run sync` synkroniserer også sektionerne `foreningen/` og `vejledninger/`. Hvert Google Docs-dokument, direkte eller via genvej, bliver til `content/<sektion>/<driveId>.md` med frontmatter. Billeder gemmes i `content/<sektion>/<driveId>/`. Ikke-accepterede forslag kommer aldrig med. Et dokument, der ikke kan konverteres, beholder sin sidste gyldige version, og resten synkroniseres.

## Filer

| Fil | Ændring |
|---|---|
| `lib/sync/markdown.ts` | Ny: serializer fra blokke til Markdown, frontmatter, resumé og en validering, der kun tillader kendte Markdown-elementer (allowlist) |
| `lib/sync/content.ts` | Udvides: skema for frontmatter i vejledninger |
| `lib/sync/drive.ts` | `DriveSource` udvides med `readDocument` og `downloadImage` |
| `lib/adapters/google/client.ts` | Ny `readDocument`: altid `PREVIEW_WITHOUT_SUGGESTIONS` og `includeTabsContent`. 404 giver `DriveAccessError` |
| `lib/adapters/google/blocks.ts` | Accepterer `PREVIEW_WITHOUT_SUGGESTIONS`. Forslagstjekket bevares som sikkerhedsregel. Overskriftsniveauer forskydes ét trin (H1→2, H2→3 …) i stedet for at H1 og H2 slås sammen |
| `lib/sync/sync.ts` | Fælles flow for PDF- og Docs-sektioner |
| `scripts/sync.ts` | Valgfrit `GOOGLE_DOCS_ACCESS_TOKEN_FILE`, når Docs-adgangen ligger i et separat token |
| `package.json` | `mdast-util-from-markdown`, `micromark-extension-gfm-table` og `mdast-util-gfm-table` gøres til eksplicitte afhængigheder. Versionerne er uændrede, fordi de allerede ligger i lockfilen |
| `tests/sync-markdown.test.ts`, `tests/sync-docs.test.ts`, `tests/drive-client.test.ts`, `tests/helpers/fake-drive.ts`, `tests/sync.test.ts` | Nye og udvidede tests |

## Regler for Markdown

| Blok | Markdown |
|---|---|
| Overskrift | `##`–`######`. H1 er sidens titel og bruges ikke i brødteksten |
| Afsnit | Tekst escapes. Fed `**`, kursiv `*`, link `[tekst](https://…)`. Bløde linjeskift bliver `\` + linjeskift |
| Punktliste | `- ` pr. punkt |
| Skillelinje | `---` med en tom linje før. Den kan derfor ikke blive til en overskrift, som i fund 2 fra fase 1 |
| Tabel med én række | Pakkes ud til almindelige blokke, fordi den bruges som layout. Det gælder pilotens otte tabeller |
| Tabel med flere rækker | GFM-tabel, hvor første række er overskrift. Flere blokke i en celle adskilles med ` · `, og listepunkter får `• `. `\|` escapes. Det er en dokumenteret forenkling |
| Billede | `![alt](./<driveId>/<sha256-16>.<ext>)`. Alt-tekst er påkrævet. PNG, JPEG og WebP |

**Valideringen tillader kun:** `paragraph`, `heading` (2–6), `text`, `strong`, `emphasis`, `break`, `link` (http/https), `list`/`listItem`, `thematicBreak`, `table`/`tableRow`/`tableCell` og `image` med en lokal sti pr. dokument. Alt andet afvises og giver en fejl for dokumentet: `html`, `code`, `blockquote`, `definition`, referencer og eksterne billeder. Valideringen køres på serializerens output og igen på hele staging-træet. I fase 2c bliver den også en remark-regel i Astro.

**Frontmatter:** `id`, `title` (filens eller genvejens navn), `updatedAt` og `summary`. Resuméet er første afsnit, der ikke er en overskrift, afkortet ved en ordgrænse til højst 300 tegn. Værdierne skrives i JSON-format, som også er gyldig YAML.

## Testkriterier

1. Ikke-accepterede forslag kommer ikke med. Klienten sender altid `PREVIEW_WITHOUT_SUGGESTIONS`. Et svar, der alligevel har `suggested*`-felter, afvises, og den sidste version beholdes.
2. Et dokument, der ikke kan konverteres, beholder sin sidste gyldige version, og de øvrige synkroniseres. Det gælder fx flere faner, flettede celler, nummererede lister og et billede uden alt-tekst.
3. En genvej til et Google Docs-dokument giver målets indhold med genvejens navn som titel.
4. Billeder ligger pr. dokument, deres bytes er bevaret, og der refereres til dem relativt. Fjernes dokumentet, forsvinder også dets billeder.
5. Serializeren bevarer al tekst ved en tur frem og tilbage gennem mdast, også med Markdown-tegn, `<script>`, `&amp;` og `|`.
6. En skillelinje lige efter et afsnit giver en `thematicBreak` og ikke en overskrift.
7. Valideringen afviser rå HTML, kodeblokke, citater, javascript-links, billedreferencer og eksterne billeder.
8. `updatedAt` ændrer sig kun, når titel, tekst eller billeder ændrer sig.
9. Alle tests fra 2a og hele den gamle suite består. Typekontrollen og buildet består.

## Risici

- **Forenklingen i tabelceller.** ` · ` mellem flere afsnit i en celle mister formatering mellem afsnittene, men tabet er synligt og konsekvent. Viser rigtige dokumenter, at det ikke er godt nok, skal Astro i fase 2c i stedet rendere fra blokke.
- **`fase1-test` afvises live** på grund af to faner. Det er forventet og må gerne publiceres, hvis det rettes (brugerens beslutning).
- **Tokens:** De kortlivede tokens fra 21. oktober er formentlig udløbet. Er de det, laves live-kørslen, når der foreligger et nyt token.
- **Ændringen af overskriftsniveauer** påvirker også den gamle pilotadapter. Den gamle pilot fjernes i fase 2d, og godkendte snapshots ændres ikke.

## Resultat 21. oktober 2026

- **Tests:** 91 består, heraf 29 nye: 20 for serializer og validering, 7 for Docs-sync og 1 for klienten. Én eksisterende test i 2a-suiten er udvidet. Typekontrollen giver 0 fejl, advarsler og hints.
- **Build:** Integrationstesten i `bun test` bygger hele sitet i en isoleret tempmappe og består. Et almindeligt `bun run build` i arbejdsmappen blev ikke kørt, fordi brugerens dev-server (startet 21:52) holder den gyldige `.build/lock`.
- **Undervejs:** Rundturstjekket fangede selv to fejl i serializeren, som er rettet:
  - Kursiv, der ikke kan lukke i CommonMark. Den udelades nu i stedet for at blive til stjerner.
  - Parenteser i link-URL'er. De procent-kodes nu.
- **Live-kørsel kl. 20:16 UTC** med to kortlivede tokens for admin-kontoen (`drive.readonly` og `documents.readonly`):
  - 2 nye vejledninger: `foreningen/1NPom81Z….md` med titlen "foreningen" og `vejledninger/1bUaMmDm….md` med titlen "vejledning".
  - 1 uændret PDF.
  - 1 forventet fejl: `fase1-test` blev afvist på grund af to faner og er ikke publiceret.
  - Frontmatter og brødtekst er korrekte. Det afsluttende hårde linjeskift fra Drive-eksporten (`  \n`) er ikke med.
  - Exit-kode 2, fordi der var én fejl.
- **Afvigelse:** `readSection` er nu streng. En fil i en synkroniseret sektion, som sync ikke selv har skrevet, stopper kørslen. Også PDF-sektionen er omfattet, hvor 2a tidligere ignorerede ukendte filer.
- **Ikke committet:** kode, tests, `content/` og denne plan.
