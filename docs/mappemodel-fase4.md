# Mappemodellen — fase 4: rapport og fast kørsel

Planen kræver en rapport efter hver synkronisering og en natlig kørsel, der også kan startes manuelt. Hvor det skal køre, afhænger af foreningens åbne beslutninger (afsnit 3). Denne fase bygger derfor kun det, der er uafhængigt af kørselsmiljøet. Selve planlægningen (cron, workflow, servicekonto og afsendelse af rapporten) implementeres først, når beslutningerne er taget.

## 1. Mål

`bun run publish` laver én komplet kørsel, der er ens lokalt og i et kommende kørselsmiljø:

```text
sync → rapport (.sync/report.md + .json) → commit af content/ kun ved ændringer → build
```

- **Commit:** Commit-beskeden lister nye, ændrede og fjernede sider. Kun `content/` committes, så andre ændringer i arbejdsmappen røres ikke. Der pushes ikke.
- **Afbrudt sync:** Intet committes, og der bygges ikke.
- **Fejl i enkelte filer:** `content/` er opdateret og committes. Buildet køres, og exit-koden er 2, så et kørselsmiljø kan markere rapporten.
- **Fejlende build:** Commit'et af `content/` står ved magt, men sidste gyldige `dist` bevares (som i dag). Exit-koden er 1.

## 2. Filer

| Fil | Ændring |
|---|---|
| `lib/sync/report.ts` | `commitMessage(report)`: én linje med antal og dato samt lister over nye, ændrede og fjernede sider |
| `lib/run.ts` | Ny: `runOnce` (sync → rapport → commit ved ændringer), testbar med `FakeDrive` og et midlertidigt Git-repo |
| `lib/google/env.ts` | Ny: `DriveSource` ud fra `GOOGLE_ACCESS_TOKEN_FILE` og eventuelt `GOOGLE_DOCS_ACCESS_TOKEN_FILE`. Bruges af både `sync` og `publish` |
| `scripts/publish.ts` | Ny CLI: `runOnce` efterfulgt af build. `--no-commit` og `--allow-mass-removal` |
| `scripts/sync.ts` | Bruger `lib/google/env.ts`. Adfærden er uændret |
| `package.json` | Script `publish` |
| `tests/run.test.ts` | Nye tests |

## 3. Forslag til kørselsmiljø (kræver beslutning)

Anbefaling: **GitHub Actions i et privat repository under foreningens egen GitHub-organisation**. Det dækker åben beslutning 1 og 2.

| Del | Forslag | Begrundelse |
|---|---|---|
| Kørsel | Workflow med `schedule` (fx kl. 03:00 dansk tid) og `workflow_dispatch` (knappen "Run workflow" til manuel start) | Ingen server at vedligeholde. Kørslen tager få minutter og ligger inden for den gratis kvote for private repositories. Historik og logs ligger ved koden |
| Google-adgang | **Servicekonto** i foreningens Google Cloud-projekt med rollen **Læser** på fællesdrevet "Grøndalsvænge hjemmeside" (beslutning 3) | Den ejes af foreningen og er ikke knyttet til en person. Den kan kun læse fællesdrevet, og genvejsmål inde i fællesdrevet kan den også læse. Mål uden for fællesdrevet skal deles med den, ellers står de som "manglende adgang" i rapporten (fund 5 i fase 0) |
| Nøgle | JSON-nøglen gemmes som GitHub Actions-secret. Kortlivede tokens dannes i kørslen med `node:crypto` (signeret JWT) uden nye afhængigheder | Tokenet forlader aldrig kørslen og står aldrig i chat eller Git. Workload Identity Federation (uden nøgle) er et alternativ, men kræver mere opsætning |
| Commit | Kørslen committer `content/` med en teknisk identitet og pusher til repository'et | Git-historikken er versionsstyring og tilbagerulning, som planen kræver |
| Rapport (beslutning 4) | Forslag i prioriteret rækkefølge: (a) e-mail fra GitHub ved fejl samt `report.md` som job summary, (b) en indgående webhook til et Google Chat-rum for redaktørerne, (c) e-mail via foreningens SMTP | (a) kræver intet. (b) er én HTTP-POST uden Google-rettigheder. (c) kræver en SMTP-konto. Gmail API frarådes, fordi det kræver en skriverettighed |
| Upload (beslutning 5) | Kommer senere, efter build i samme workflow. Uploaden skal spejle `dist`, så fjernede filer også slettes på serveren | Uden for fase 4 |

Alternativer, der er overvejet:

- **En lille server eller Raspberry Pi med cron:** fuld kontrol, men nogen skal vedligeholde den.
- **Kørsel på en redaktørs computer:** afhænger af én person.
- **Apps Script med tidsstyret trigger:** kan ikke køre Astro-buildet.

## 4. Testkriterier

1. En kørsel med ændringer laver præcis ét commit, som kun indeholder `content/`. Beskeden lister nye, ændrede og fjernede sider.
2. En kørsel uden ændringer laver intet commit.
3. Andre ændringer i arbejdsmappen, også staged filer uden for `content/`, bliver ikke committet og røres ikke.
4. En afbrudt sync, fx en fejlet listning, laver intet commit og intet build, og rapporten beskriver afbrydelsen.
5. Fejl i enkelte filer giver commit og exit-kode 2.
6. `--no-commit` synkroniserer og bygger uden at committe.
7. Hele suiten, typekontrollen og en lokal `bun run publish -- --no-commit` mod fællesdrevet består.

## 5. Risici

- **Fællesdrevet ejes i dag via admin@groendalsvaenge.dk.** Servicekontoen skal tilføjes som Læser af en administrator. Det er en ændring i Drive, som kræver godkendelse.
- **Repository'et har allerede et `origin`.** Hvem der ejer det, er ikke afklaret i dette forløb (beslutning 1). Der pushes ikke, før det er afklaret.
- **Commit fra kørslen og lokale commits kan kollidere,** hvis der redigeres i `content/` begge steder. `content/` må kun skrives af sync, og kørslen bør trække før den starter. Det tages med, når workflowet bygges.

## 6. Resultat 21. oktober 2026

- **Tests:** 84 består, heraf 4 nye i `tests/run.test.ts`. De kører i et midlertidigt Git-repo med `FakeDrive` og dækker kriterie 1–6:
  - Kun `content/` kommer med i commit'et. En staged `noter.txt` og en ændret `README.md` forbliver urørte.
  - En kørsel uden ændringer giver intet commit.
  - En afbrudt kørsel giver hverken commit eller ændringer, og rapporten forklarer hvorfor.
  - Fejl i enkelte filer committes stadig, og commit-beskeden nævner dem.
  - `--no-commit` committer intet.

  Typekontrollen giver 0 fejl, advarsler og hints.
- **Lokal kørsel kl. 20:52 UTC:** `bun run publish -- --no-commit` mod fællesdrevet gav 5 uændrede filer og "Intet at committe". Buildet bestod outputkontrollen med 5 sider. Exit-koden var 2 på grund af den kendte fejl for `fase1-test`.
- **Afvigelse:** `bun run sync` bruger nu samme `runOnce` uden commit og uden build, så rapporten kun skrives ét sted. Adfærden og exit-koderne er uændrede.
- **Ikke implementeret (afventer beslutning 1–4):** GitHub Actions-workflow, servicekonto og token fra JWT, push og afsendelse af rapporten.
