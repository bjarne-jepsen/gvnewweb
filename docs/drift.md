# Drift: "Publicér nu" fra Drive til newweb.groendalsvaenge.dk

Status 4. november 2026: bygget, og opsætningen er i gang. Hosting er Cloudflare Pages. Trinene markeret **(admin/Bjarne)** kræver adgang til konti.

## Sådan virker det

```text
Admin vælger "Hjemmeside → Publicér nu" i et låst ark i Drive
  → Apps Script (scripts/apps-script/publicer.gs) beder GitHub starte "Publicér"
     → .github/workflows/publish.yml:
        1. tjekker, at den, der starter kørslen, står i PUBLISH_ACTORS
        2. henter et kortlivet token som servicekontoen (kun læseadgang til Drive)
        3. bun run publish: sync → rapport → commit af content/ → build → outputkontrol
        4. pusher commit'et
        5. wrangler pages deploy: uploader dist/ til Cloudflare Pages
  → newweb.groendalsvaenge.dk er opdateret efter 2–3 minutter
```

- **Drive er den eneste kilde.** Hver kørsel bygger sektionerne i `content/` forfra ud fra Drive. Jobbet `content-source` i `checks.yml` fejler, hvis andre end workflowet ændrer sider i `content/`. Kun `_slugs.json` og `_redirects.json` må rettes af en udvikler. Lokalt bruges `bun run publish -- --no-commit`.
- **Ingen tidsplan.** Sitet ændrer sig kun, når nogen trykker. En nyhed med en fremtidig dato vises først ved den første kørsel på eller efter datoen.
- **Fejl i enkelte filer:** Sitet opdateres, kørslen markeres som fejlet, og rapporten står i kørslens oversigt på GitHub. **Afbrudt sync:** intet ændres, hverken i Git eller på Cloudflare.
- **Tilbagerulning:** Cloudflare skifter til den nye version på én gang og gemmer de tidligere. I Cloudflare under *Workers & Pages → gvnewweb → Deployments* vælger du en ældre version og trykker *Rollback*. Næste kørsel henter dog igen fra Drive.
- **`_redirects` og `_headers`** dannes af buildet. De giver rigtige 301-redirects for alle gamle adresser (WordPress og omdøbte sider), med og uden skråstreg til sidst, og `X-Robots-Tag: noindex` for hele sitet. Redirect-siderne med meta-refresh bliver liggende som reserve.

## Opsætning

### 1. Google Cloud **(admin)**

Log ind på console.cloud.google.com som admin@groendalsvaenge.dk.

1. Opret projektet, fx `gv-hjemmeside`.
2. Kør i Cloud Shell (ikonet `>_` øverst). Sæt `PROJECT_ID` til projektets ID, som det står i projektvælgeren:

```sh
PROJECT_ID=gv-hjemmeside
REPO=bjarne-jepsen/gvnewweb
gcloud config set project $PROJECT_ID
gcloud services enable drive.googleapis.com docs.googleapis.com sheets.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
gcloud iam service-accounts create gv-sync --display-name="Hjemmeside: læser Drive"
gcloud iam workload-identity-pools create github --location=global --display-name=GitHub
gcloud iam workload-identity-pools providers create-oidc gvnewweb --location=global \
  --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
NUM=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
MEMBER="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
for ROLE in roles/iam.workloadIdentityUser roles/iam.serviceAccountTokenCreator; do
  gcloud iam service-accounts add-iam-policy-binding gv-sync@$PROJECT_ID.iam.gserviceaccount.com --role=$ROLE --member="$MEMBER"
done
echo "GCP_WORKLOAD_PROVIDER=projects/$NUM/locations/global/workloadIdentityPools/github/providers/gvnewweb"
echo "GCP_SERVICE_ACCOUNT=gv-sync@$PROJECT_ID.iam.gserviceaccount.com"
```

Der oprettes ingen nøgle. Kun workflows i dette repository kan låne servicekontoen.

3. Del fællesdrevet "Grøndalsvænge hjemmeside" med `gv-sync@…iam.gserviceaccount.com` som **Læser**. Afviser Drive adressen, så tillad deling uden for organisationen for netop dette fællesdrev (Workspace Admin → Apps → Drive → Delingsindstillinger).

*Alternativ:* En JSON-nøgle til servicekontoen, gemt som secret `GCP_SA_KEY`. Den bruges kun, hvis `GCP_WORKLOAD_PROVIDER` ikke er sat. Den er ofte blokeret i nye organisationer og bør undgås.

### 2. Cloudflare **(Bjarne)**

1. Opret en gratis konto på dash.cloudflare.com.
2. Find dit **Account ID**. Det står i højre side på kontoens forside og under *Workers & Pages*.
3. Lav et API-token under *Profil → API Tokens → Create Token → Create Custom Token*:
   - Permissions: *Account → Cloudflare Pages → Edit*
   - Account Resources: kun din konto
   - Kopiér tokenet, når det vises. Det vises kun én gang.
4. Pages-projektet `gvnewweb` oprettes automatisk ved første kørsel. Vil du hellere kalde det noget andet, så sæt variablen `CLOUDFLARE_PROJECT`.

### 3. GitHub **(Bjarne)**

Under *Settings → Secrets and variables → Actions*:

| Type | Navn | Værdi |
|---|---|---|
| Variable | `GCP_WORKLOAD_PROVIDER` | Fra trin 1.2 |
| Variable | `GCP_SERVICE_ACCOUNT` | Fra trin 1.2 |
| Variable | `PUBLISH_ACTORS` | Valgfri. GitHub-brugere, der må starte kørslen, adskilt af komma. Standard er repo'ets ejer |
| Variable | `CLOUDFLARE_PROJECT` | Valgfri. Standard er `gvnewweb` |
| Secret | `CLOUDFLARE_API_TOKEN` | Tokenet fra trin 2.3 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account ID fra trin 2.2 |

**Første test:** Gå til *Actions → Publicér → Run workflow*. Når kørslen er grøn, ligger sitet på `https://gvnewweb.pages.dev`. Prøv en gammel adresse, fx `/andelshaveren/`. Den skal give 301 til `/bo-her/`.

### 4. Domænet newweb.groendalsvaenge.dk **(Bjarne)**

1. I Cloudflare: *Workers & Pages → gvnewweb → Custom domains → Set up a custom domain*. Skriv `newweb.groendalsvaenge.dk`. Cloudflare viser derefter en CNAME, der skal oprettes.
2. Hos Simply: Åbn domænet `groendalsvaenge.dk` og vælg **DNS**.
   - Slet de A- og AAAA-poster, der hedder `newweb`. Det er dem, der i dag peger på webhotellet.
   - Opret en ny post: type **CNAME**, navn `newweb`, værdi `gvnewweb.pages.dev`.
3. Cloudflare tjekker posten og udsteder et certifikat. Det tager typisk få minutter, men kan tage op til et døgn, mens DNS opdateres.
4. Subdomænet på Simplys webhotel kan derefter fjernes, og den mappe, du FTP'ede op, bruges ikke længere.

### 5. Knappen i Drive **(Bjarne + admin)**

1. **(Bjarne)** Lav et fine-grained token på github.com → *Settings → Developer settings → Fine-grained tokens*:
   - Repository access: kun `gvnewweb`
   - Permissions: *Contents: Read and write*
   - Udløb: højst 1 år. Skriv datoen i kalenderen.

   Tokenet starter kørslen i dit navn. Derfor skal din GitHub-bruger stå i `PUBLISH_ACTORS` (det gør den som ejer).
2. **(admin)** Opret et nyt Google-ark, "Publicér hjemmesiden", i mappen `redaktion/`. Del det, så **kun admin kan redigere**. Den, der kan redigere, kan også læse tokenet.
3. **(admin)** Gå til *Udvidelser → Apps Script*, og indsæt `scripts/apps-script/publicer.gs`. Gem. Udfyld disse under *Projektindstillinger → Script-egenskaber*:
   - `GITHUB_REPO` = `bjarne-jepsen/gvnewweb`
   - `GITHUB_TOKEN` = tokenet fra punkt 1
   - `ALLOWED_EMAILS` = de adresser, der må publicere
4. Genindlæs arket. Menuen *Hjemmeside* dukker op med *Publicér nu* og *Publicér og tillad sletning*. Første gang beder Google om tilladelse til at "oprette forbindelse til en ekstern tjeneste". Det er kaldet til GitHub.

## Sektioner i Drive

En mappe i roden, hvis navn starter med et tal, er en sektion på sitet. Se reglerne i README under "Mappemodellen".

| I Drive | På sitet |
|---|---|
| Opret "35 Udlejning" | Ny sektion `/udlejning/`, nr. 35 i menuen, når den har en side |
| Omdøb "20 Bo her" til "20 Bo i Grøndalsvænge" | Nyt menunavn. Adressen er stadig `/bo-her/` |
| Skift 20 til 15 | Kun rækkefølgen i menuen ændres |
| Slet mappen, flyt den ud af roden eller fjern tallet | Sektionen og dens sider forsvinder. Kræver *Publicér og tillad sletning* |
| Læg et Google-dokument med navnet `_intro` i mappen | Første afsnit er en kort ingres ved siden af titlen (højst ca. 200 tegn). De næste afsnit står som brødtekst under titlen. Overskrifter (fx Overskrift 2) efter første afsnit vises som mellemrubrikker; en overskrift før første afsnit vises ikke. Links til andre Google-dokumenter og til sektionsmapper bliver links på hjemmesiden. Højst 2000 tegn i alt |
| Skriv et afsnit `Søgeord: trailer, telt` i et dokument | Afsnittet vises ikke. Søgningen finder siden på de ord |
| Læg et Google-dokument i nyhedsmappen | En ny nyhed. Datoen er dagen for første publicering, medmindre dokumentet har et afsnit `Dato: 21.10.2026` |
| Flyt en nyhed til en mappe uden tal, fx "Nyhedskladder" | Nyheden forsvinder fra sitet |
| Læg et Google-dokument med navnet `_forside` i roden | Afsnittene bliver forsidens intro. Punkter med link til en side bliver "Det vigtigste" |

En sektion, der hentes tilbage fra papirkurven, får sine gamle adresser igen. En ny mappe med samme navn som en eksisterende sektion får `-2` i adressen. En sektions adresse kan i dag ikke ændres uden at flytte siderne til en ny mappe.

## Skift fra nyhedsarket til dokumenter (november 2026)

Nyheder skrives nu som ét Google-dokument pr. nyhed (se README under "Nyheder"). Ved skiftet:

1. Slet nyhedsarket i nyhedsmappen. Ligger det der stadig, giver det en advarsel, men det publiceres ikke.
2. Opret mappen `Nyhedskladder` i roden af fællesdrevet, uden tal foran.
3. Den første kørsel efter skiftet fjerner de to testnyheder fra arket. Det er hele nyhedssektionen, så kørslen skal startes med *Publicér og tillad sletning*.

## Kendte begrænsninger

- **Dato-chips:** En dato indsat med @ i Google Docs understøttes ikke, og dokumentet publiceres ikke. Skriv datoen som almindelig tekst, fx `Dato: 21.10.2026`.
- **Ikke afprøvet mod Cloudflare og Google.** `_redirects`, `_headers` og uploaden er kun testet lokalt og med `wrangler --help`. Første kørsel viser, om opsætningen er rigtig.
- **Tokenet i arket er bundet til Bjarnes GitHub-konto.** Når foreningen overtager repo'et, skal der laves et nyt token. Det samme gælder Cloudflare-kontoen.
- **Admin får ingen besked, hvis kørslen fejler.** GitHub sender en e-mail til repo-ejeren. Rapporten står i kørslens oversigt.
