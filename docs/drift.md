# Drift: "Publicér nu" fra Drive til newweb.groendalsvaenge.dk

Status 26. oktober 2026: bygget, men ikke sat op. Trinene markeret **(admin/Bjarne)** kræver adgang til konti.

## Sådan virker det

```text
Admin vælger "Hjemmeside → Publicér nu" i et låst ark i Drive
  → Apps Script (scripts/apps-script/publicer.gs) beder GitHub starte "Publicér"
     → .github/workflows/publish.yml:
        1. tjekker, at den, der starter kørslen, står i PUBLISH_ACTORS
        2. henter et kortlivet token som servicekontoen (kun læseadgang til Drive)
        3. bun run publish: sync → rapport → commit af content/ → build → outputkontrol
        4. pusher commit'et
        5. scripts/deploy-simply.sh: pakker dist/ ud ved siden af den nuværende mappe og bytter
  → newweb.groendalsvaenge.dk er opdateret efter 2–3 minutter
```

- **Drive er den eneste kilde.** Hver kørsel bygger sektionerne i `content/` forfra ud fra Drive. Jobbet `content-source` i `checks.yml` fejler, hvis andre end workflowet ændrer sider i `content/`. Kun `_slugs.json` og `_redirects.json` må rettes af en udvikler. Lokalt bruges `bun run publish -- --no-commit`.
- **Ingen tidsplan.** Sitet ændrer sig kun, når nogen trykker. En nyhed med en fremtidig dato vises først ved den første kørsel på eller efter datoen.
- **Fejl i enkelte filer:** Sitet opdateres, kørslen markeres som fejlet, og rapporten står i kørslens oversigt på GitHub. **Afbrudt sync:** intet ændres, hverken i Git eller på Simply.
- **Tilbagerulning:** Den forrige version ligger på Simply som `<mappe>.gammel` indtil næste kørsel. Omdøb den tilbage over SSH. Indholdet kan også rulles tilbage i Git, men næste kørsel henter alligevel fra Drive.
- **`.htaccess`** dannes af buildet. Den giver rigtige 301-redirects for alle redirects (WordPress og omdøbte sider) og `X-Robots-Tag: noindex` for hele sitet. Redirect-siderne med meta-refresh bliver liggende som reserve.

## Opsætning

### 1. Google Cloud **(admin)**

Log ind på console.cloud.google.com som admin@groendalsvaenge.dk.

1. Opret projektet, fx `gv-hjemmeside`.
2. Slå disse API'er til: Google Drive API, Google Docs API, Google Sheets API, IAM Service Account Credentials API og Security Token Service API.
3. Kør i Cloud Shell (ikonet `>_` øverst). Erstat `PROJECT_ID`, hvis projektet hedder noget andet:

```sh
PROJECT_ID=gv-hjemmeside
REPO=bjarne-jepsen/gvnewweb
gcloud config set project $PROJECT_ID
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

4. Del fællesdrevet "Grøndalsvænge hjemmeside" med `gv-sync@…iam.gserviceaccount.com` som **Læser**. Afviser Drive adressen, så tillad deling uden for organisationen for netop dette fællesdrev (Workspace Admin → Apps → Drive → Delingsindstillinger).

*Alternativ:* En JSON-nøgle til servicekontoen, gemt som secret `GCP_SA_KEY`. Den bruges kun, hvis `GCP_WORKLOAD_PROVIDER` ikke er sat. Den er ofte blokeret i nye organisationer og bør undgås.

### 2. Simply **(Bjarne)**

1. Lav en nøgle, der kun bruges til upload:
   ```sh
   ssh-keygen -t ed25519 -f gv-deploy -N "" -C gv-publicer
   ssh-keyscan ssh.simply.com > gv-known-hosts
   ```
2. Indsæt indholdet af `gv-deploy.pub` i Simplys kontrolpanel under *Website → SSH-adgang*.
3. Find subdomænets mappe, og tjek, at `tar` findes:
   ```sh
   ssh -i gv-deploy BRUGER@ssh.simply.com 'pwd; ls; tar --version | head -1'
   ```
   Mappen er stien til newweb set fra hjemmemappen, fx `public_html/newweb` eller `newweb.groendalsvaenge.dk`.
4. **Alt i mappen bliver erstattet** ved første kørsel. Det, der ligger der nu, flyttes til `<mappe>.gammel`.

### 3. GitHub **(Bjarne)**

Under *Settings → Secrets and variables → Actions*:

| Type | Navn | Værdi |
|---|---|---|
| Variable | `GCP_WORKLOAD_PROVIDER` | Fra trin 1.3 |
| Variable | `GCP_SERVICE_ACCOUNT` | Fra trin 1.3 |
| Variable | `SIMPLY_USER` | Dit SSH-/FTP-brugernavn hos Simply |
| Variable | `SIMPLY_PATH` | Mappen fra trin 2.3 |
| Variable | `PUBLISH_ACTORS` | Valgfri. GitHub-brugere, der må starte kørslen, adskilt af komma. Standard er repo'ets ejer |
| Secret | `SIMPLY_SSH_KEY` | Hele indholdet af `gv-deploy` (den private nøgle) |
| Secret | `SIMPLY_KNOWN_HOSTS` | Indholdet af `gv-known-hosts` |

Slet derefter `gv-deploy` fra din computer, eller gem den i en adgangskodeboks.

**Første test:** *Actions → Publicér → Run workflow.* Åbn derefter newweb.groendalsvaenge.dk og en gammel adresse, fx `/andelshaveren/`. Den skal give 301 til `/bo-her/`. Giver sitet fejl 500, tillader Simply ikke `.htaccess`-direktiverne. Så slet `.htaccess` på serveren, og sig til.

### 4. Knappen i Drive **(Bjarne + admin)**

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
4. Genindlæs arket. Menuen *Hjemmeside → Publicér nu* dukker op. Første gang beder Google om tilladelse til at "oprette forbindelse til en ekstern tjeneste". Det er kaldet til GitHub.

## Kendte begrænsninger

- **Ikke afprøvet mod Simply og Google.** Både `.htaccess` og byttet af mapper er kun testet lokalt. Det er uvist, om Simply tillader `RedirectMatch`/`Header` i `.htaccess`, og om SSH-adgangen giver en almindelig shell med `tar`. Første kørsel viser det.
- **Mens mapperne byttes,** kan en besøgende få en fejl i et øjeblik. Det sker mellem de to omdøbninger, og vinduet er på millisekunder.
- **Tokenet i arket er bundet til Bjarnes GitHub-konto.** Når foreningen overtager repo'et, skal der laves et nyt token.
- **Admin får ingen besked, hvis kørslen fejler.** GitHub sender en e-mail til repo-ejeren. Rapporten står i kørslens oversigt.
