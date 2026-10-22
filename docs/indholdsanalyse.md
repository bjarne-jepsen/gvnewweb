# Indholdsanalyse af groendalsvaenge.dk

Udarbejdet 22. oktober 2026 som grundlag for, hvilke sider fra det nuværende WordPress-site der skal leve videre. Kilden er sitets offentlige WordPress-API og forsidens menu, hentet samme dag. Rådata ligger i `.local/wp/` uden for Git. Der er ikke ændret noget på sitet eller i Drive.

## Udgangspunkt

- **Ingen dokumentdeling.** Vedtægter, regulativer, referater, regnskaber, kontrakter og andre dokumenter ligger fremover i **ProBo** hos administrator. Hjemmesiden henviser dertil, men deler ikke selv filerne.
- **Et oplysningssite.** Andelshavere og folk udefra skal hurtigt kunne danne sig et overblik over det mest grundlæggende.
- **Intet login.** Det nye site har ingen adgangsbeskyttet del. Alt, hvad der i dag ligger under "Internt", skal derfor enten være offentligt eller flyttes til ProBo.

## Det nuværende site i tal

| | Antal | Bemærkning |
|---|---|---|
| Sider | 63 | 38 er i menuen, inklusive overskrifter. 25 ligger uden for menuen |
| Indlæg | 52 | 47 er fra 2011–2019 (kategorien "Arkiv"). Kun 2 er fra 2025 |
| Links til PDF'er | 34 | 12 af dem på "Oversigt over vedtægter og regler" og 7 på "Valuarvurdering" |
| Tomme eller næsten tomme sider | 15 | Fx login- og test-sider, tomme gallerier og en tom side for overdragelse |
| Næsten ens sider | 2 | "Bestyrelse og udvalg" og "Bestyrelsen" har samme tekst |

## Anbefaling i kort form

Fra de 63 sider bliver der omkring 22 sider fordelt på fem sektioner. Ca. 20 sider genbruges, ofte samlet eller forkortet. Ca. 15 sider bliver til henvisninger til ProBo, og resten udgår. Indlæggene overføres ikke. To af dem indgår i nye sider.

## Forslag til ny struktur

Fem sektioner. Hver sektion er en mappe i fællesdrevet, og mappenavnet bliver første del af adressen.

| Sektion (mappe og URL) | Til hvem | Sider |
|---|---|---|
| `om-groendalsvaenge/` | Udefra og nye beboere | Historie og arkitektur (389 huse) · Kort og nærområde · Sådan får du et hus |
| `bo-her/` | Andelshavere, praktisk | Planlægger du at bygge? · Sælg dit hus · Ventelister · Forsikringsskader · Affald og renovation · Parkering · Hjertestarter · Udlån af fællesudstyr · Stolper og stakitter · Husorden kort fortalt · Leje af lokaler |
| `faellesskab/` | Alle | Fester og traditioner · Aktiviteter og klubber (inkl. De Gule Spejdere) · Legepladser · Grøndalsvænge på Facebook |
| `foreningen/` | Andelshavere og udefra | Bestyrelsen (inkl. medlemmer) · Udvalg og arbejdsgrupper · Generalforsamling · Regler og dokumenter (henvisning til ProBo) · Kontakt (inkl. administration og Grøndalsvænge Nyt) |
| `nyheder/` | Alle | Nyhedsarket, som det allerede virker |

Forsiden skrives i koden: en kort introduktion, genveje til det, folk oftest leder efter, og de seneste nyheder. Genvejene er Kontakt, Sådan får du et hus, Sælg dit hus, Planlægger du at bygge?, Forsikringsskader og Affald. Kontakt står også i sidefoden på alle sider.

## Side for side

**Behold** betyder, at teksten genbruges, ofte forkortet. **Saml** betyder, at den indgår i en anden side. **ProBo** betyder, at indholdet er et dokument og flyttes til ProBo, og siden henviser dertil. **Udgår** betyder, at siden ikke kommer med.

### Andelsboligforeningen og Om foreningen

| Nuværende side | Ord | Anbefaling | Ny placering og bemærkning |
|---|---|---|---|
| `/` Forside | 257 | Erstattes | Ny forside med genveje og nyheder. I dag er forsiden en liste af indlæg |
| `/andelsboligforeningen/` | 242 | Saml | → Historie og arkitektur |
| `/om-foreningen/` | 79 | Saml | → Historie og arkitektur. Siden er ikke opdateret siden 2022 |
| `/andelsboligforeningen/hvordan-faar-jeg-hus/` | 520 | **Behold** | → Sådan får du et hus. Den vigtigste side for folk udefra. PDF-linket erstattes af en henvisning til ProBo |
| `/andelsboligforeningen/groendalsvaenge-andelsboligforening-oversigtskort/` | 38 | Saml | → Kort og nærområde. Det indlejrede kort bliver til et billede med link, fordi sitet ikke indlejrer andre sider |
| `/andelsboligforeningen/kontakt/` | 238 | **Behold** | → Kontakt |
| `/om-foreningen/administration/` | 7 | Saml | → Kontakt |
| `/andelsboligforeningen/kommunikation-i-foreningen/` | 348 | Saml | → Kontakt, som et afsnit om Grøndalsvænge Nyt og andre kanaler |
| `/andelsboligforeningen/generalforsamling/` | 212 | **Behold** | → Generalforsamling: hvad den er, hvornår og hvem der kan deltage. Referaterne flyttes til ProBo |
| `/andelsboligforeningen/oversigt-over-vedtaegter-og-regler/` | 412 | ProBo | 12 PDF'er. Erstattes af "Regler og dokumenter": en kort forklaring af, hvilke regler der findes, og hvor man finder dem i ProBo |
| `…/regulativ-for-medlemmers-fortrinsret-til-ledige-huse/` | 58 | ProBo | |
| `/regulativ-for-ekspektanter/` | 63 | ProBo | |
| `/om-foreningen/aarsregnskab/` | 34 | ProBo | |
| `/om-foreningen/bevarende-lokalplan/` | 23 | Saml | → Planlægger du at bygge?, med link til kommunens lokalplan i stedet for en PDF |
| `/om-foreningen/bygningerne/` | 52 | Udgår | Bygningsregulativet blev aldrig godkendt, og siden siger selv, at det ikke er bindende. Det kan forvirre |
| `/om-foreningen/billeder-fra-frihedsfesten-2018/` | 0 | Udgår | Tom |

### Andelshaveren

| Nuværende side | Ord | Anbefaling | Ny placering og bemærkning |
|---|---|---|---|
| `/andelshaveren/` | 77 | Erstattes | Introduktionen til sektionen skrives i koden |
| `/andelshaveren/byggeprojekter/` | 272 | **Behold** | → Planlægger du at bygge? PDF-linket → ProBo |
| `/andelshaveren/hvordan-saelger-jeg-mit-hus/` | 108 | **Behold** | → Sælg dit hus. PDF-linket → ProBo |
| `/andelshaveren/ekspektance-og-internliste/` | 209 | **Behold** | → Ventelister, med henvisning til Sådan får du et hus |
| `/andelshaveren/anmeldelse-af-forsikringsskader/` | 126 | **Behold** | → Forsikringsskader. Indlægget om skybrud og storm fra 2025 indgår her |
| `/andelshaveren/renovation/` | 124 | **Behold** | → Affald og renovation |
| `/andelshaveren/hjertestarter/` | 185 | **Behold** | |
| `/andelshaveren/parkering-i-groendalsvaenge/` | 10 | Behold og udbyg | Siden består i dag kun af en privat Gmail-adresse. Den bør skifte til en adresse, som foreningen ejer, og have et par linjer om ordningen |
| `/andelshaveren/oversigtskort-over-groendalsvaenge/` | 449 | **Behold**, forkortet | → Kort og nærområde. Godt materiale til folk udefra |
| `/andelshaveren/faellesskab-services/` | 0 | Udgår | Tom |
| `/andelshaveren/kort-over-bytteboliger/` | 0 | Udgår | Tom, fra 2021 |

### Bestyrelse og udvalg

| Nuværende side | Ord | Anbefaling | Ny placering og bemærkning |
|---|---|---|---|
| `/bestyrelse-og-udvalg/` og `/bestyrelse-og-udvalg/bestyrelsen/` | 240 og 268 | Saml | → Bestyrelsen. Teksterne er næsten ens |
| `/bestyrelse-og-udvalg/bestyrelsesmedlemmer-2/` | 119 | Saml | → Bestyrelsen. Navnene står allerede offentligt i dag. Om de skal blive ved med det, afgør redaktøren |
| `/bestyrelse-og-udvalg/bestyrelsens-udvalg/` | 182 | **Behold** | → Udvalg og arbejdsgrupper |
| `/bestyrelse-og-udvalg/eksterne-udvalg-og-arbejdsgrupper/` | 280 | Saml | → Udvalg og arbejdsgrupper |
| `/bestyrelse-og-udvalg/afloenningspolitik-for-bestyrelsen/` | 188 | ProBo | En politik, der er vedtaget af foreningen. Den kan nævnes med én sætning på Bestyrelsen |
| `/bestyrelse-og-udvalg/processer-i-foreningen/` | 35 | Udgår | Fra 2022, næsten tom og ikke i menuen |

### Socialt

| Nuværende side | Ord | Anbefaling | Ny placering og bemærkning |
|---|---|---|---|
| `/groendalsvaenge-socialt/` | 88 | Erstattes | Introduktionen til sektionen skrives i koden |
| `…/fester-og-traditioner-i-groendalsvaenge/` | 360 | **Behold** | |
| `…/aktiviteter-og-faellesskab-i-groendalsvaenge/` | 128 | **Behold** | → Aktiviteter og klubber. Den nævner Fritidsforeningen, som er lukket, og bør opdateres. Ikke i menuen i dag |
| `…/de-gule-spejdere-i-groendalsvaenge/` | 90 | Saml | → Aktiviteter og klubber |
| `…/legepladser-i-groendalsvaenge/` | 250 | **Behold** | |
| `…/leje-af-lokaler-i-forretningsbygningen/` | 108 | **Behold** | → bo-her/Leje af lokaler |
| `…/facebook-sider-for-groendalsvaenge/` | 275 | **Behold**, forkortet | |
| `…/galleri/` | 0 | Udgår | Tom. Billeder deles på Facebook |

### Internt (adgangsbeskyttet i dag)

| Nuværende side | Ord | Anbefaling | Ny placering og bemærkning |
|---|---|---|---|
| `/internt-2/ting-til-udlaan-i-foreningen/` | 175 | **Behold, offentlig** | → Udlån af fællesudstyr. Indholdet er ikke følsomt, og andelshavere har gavn af at kunne finde det uden login |
| `/internt-2/stolper-og-stakitter/` | 62 | **Behold, offentlig** | Indlægget "Jeg skal købe stolper eller stakithegn" fra 2022 indgår her |
| `/internt-2/referater-af-bestyrelsesmoeder/` | 97 | ProBo | |
| `/internt-2/oversigt-over-andelsvaerdier/` | 68 | ProBo | |
| `/internt-2/valuarvurdering-for-groendalsvaenge/` | 34 | ProBo | 7 PDF'er |
| `/internt-2/aarets-andelsoverdragelser/` | 50 | ProBo | |
| `/internt-2/retssager/` | 50 | ProBo | |
| `/internt-2/arkiv-over-groendalsvaenge-nyt/` | 50 | ProBo | Kan alternativt nævnes på Kontakt, hvis arkivet skal være offentligt |
| `/internt-2/nyhedsarkiv/` | 87 | Udgår | Erstattes af `nyheder/` |
| `/internt/`, `/internt-2/` | 22 og 0 | Udgår | Der er intet login |

### Rester og test-sider

Disse sider udgår: `/amelia-test-page/`, `/gv-page/`, `/login/`, `/opret-bruger/`, `/registrering-af-ny-bruger/`, `/qa/`, `/fortovsproblemer/` (2015), `/oversigt-over-bytteboliger/` (2016) og `/overdragelse-af-andelen/` (tom).

### Husorden

`/husorden-fuld/` er en tekstside på 755 ord, opdateret i oktober 2025. Den er et vedtaget regelsæt og hører dermed til i ProBo. Den bruges dog også i hverdagen mellem naboer.

**Anbefaling:** Den gældende husorden lægges i ProBo. Hjemmesiden får siden "Husorden kort fortalt" med de vigtigste punkter (affald, hække, støj, parkering) og et link til den gældende version. Det undgår to versioner, der langsomt bliver forskellige.

## Konsekvenser for koden

Konsekvenserne er ikke implementeret. De kræver en ny lille fase med plan og godkendelse.

1. **Sektionen `dokumenter` udgår.** Den fjernes fra `config/site.json` og navigationen. Ved næste sync fjernes Vedtægter-PDF'en fra `content/`. Det enkleste er også at fjerne PDF-understøttelsen i koden, så der ikke ligger ubrugt kode. Den kan genskabes fra Git, hvis behovet opstår.
2. **De nye sektioner** kræver nye mapper i fællesdrevet (`om-groendalsvaenge`, `bo-her`, `faellesskab`) og at `vejledninger` udgår eller omdøbes. Det er ændringer i Drive og kræver godkendelse. Sektionsteksterne ligger i `lib/site/sections.ts`.
3. **Forside og sidefod** med genveje og kontakt bygges i koden.
4. **Et link til ProBo** samles ét sted i koden og bruges på "Regler og dokumenter" og i sidefoden. Det kræver ProBo-adressen.
5. **Redirects:** De gamle WordPress-adresser for de sider, der lever videre, kommer i `content/_redirects.json`. Sider, der flyttes til ProBo, peger på "Regler og dokumenter". Sider, der udgår, giver 404. Det er det mest ærlige for sider uden indhold.
6. **Indlejrede kort:** Google Maps-kortene indlejres i dag. Markdown-dialekten tillader det ikke af sikkerhedsgrunde. Kortet bliver i stedet et billede i dokumentet med et link til kortet.

## Sådan flyttes indholdet

Indholdet importeres ikke automatisk. For hver side, der beholdes eller samles:

1. Opret et Google Docs-dokument i den rigtige sektionsmappe med sidens titel som filnavn.
2. Kopiér teksten fra den nuværende side, forkort den, og fjern links til PDF'er. Henvis i stedet til ProBo.
3. Giv billeder alternativ tekst.

Jeg kan lave udkast til disse dokumenter ud fra WordPress-teksterne og lægge dem i fællesdrevet. Det er en ændring i Drive og kræver godkendelse.

## Åbne spørgsmål

1. Er den foreslåede struktur med fem sektioner og deres navne den rigtige? Navnene bliver både mappenavne og adresser.
2. Skal PDF-understøttelsen fjernes helt fra koden, eller kun sektionen?
3. Husorden: "kort fortalt" på sitet og den gældende version i ProBo, eller kun ProBo?
4. Hvad er adressen på ProBo, og har alle andelshavere adgang? Det afgør, hvordan henvisningerne formuleres.

## Bilag: redirects fra WordPress (fase 5c)

Listen ligger i `content/_redirects.json` og er gennemgået mod sideinventaret. 48 gamle adresser peger på en ny adresse. De 17 sider, der udgår, giver 404. Et redirect bliver aktivt, så snart målsiden findes. Indtil da giver build en advarsel. Siden "Om Grøndalsvænge" har fået titlen **Historie og arkitektur**, så adressen ikke bliver `/om-groendalsvaenge/om-groendalsvaenge/`.

| Gammel adresse | Ny adresse |
|---|---|
| `/andelsboligforeningen/` | `/om-groendalsvaenge/historie-og-arkitektur/` |
| `/andelsboligforeningen/generalforsamling/` | `/foreningen/generalforsamling/` |
| `/andelsboligforeningen/groendalsvaenge-andelsboligforening-oversigtskort/` | `/om-groendalsvaenge/kort-og-naeromraade/` |
| `/andelsboligforeningen/hvordan-faar-jeg-hus/` | `/om-groendalsvaenge/saadan-faar-du-et-hus/` |
| `/andelsboligforeningen/kommunikation-i-foreningen/` | `/foreningen/kontakt/` |
| `/andelsboligforeningen/kontakt/` | `/foreningen/kontakt/` |
| `/andelsboligforeningen/oversigt-over-vedtaegter-og-regler/` | `/foreningen/regler-og-dokumenter/` |
| `/andelsboligforeningen/oversigt-over-vedtaegter-og-regler/regulativ-for-medlemmers-fortrinsret-til-ledige-huse/` | `/foreningen/regler-og-dokumenter/` |
| `/andelshaveren/` | `/bo-her/` |
| `/andelshaveren/anmeldelse-af-forsikringsskader/` | `/bo-her/forsikringsskader/` |
| `/andelshaveren/byggeprojekter/` | `/bo-her/planlaegger-du-at-bygge/` |
| `/andelshaveren/ekspektance-og-internliste/` | `/bo-her/ventelister/` |
| `/andelshaveren/hjertestarter/` | `/bo-her/hjertestarter/` |
| `/andelshaveren/hvordan-saelger-jeg-mit-hus/` | `/bo-her/saelg-dit-hus/` |
| `/andelshaveren/oversigtskort-over-groendalsvaenge/` | `/om-groendalsvaenge/kort-og-naeromraade/` |
| `/andelshaveren/parkering-i-groendalsvaenge/` | `/bo-her/parkering/` |
| `/andelshaveren/renovation/` | `/bo-her/affald-og-renovation/` |
| `/bestyrelse-og-udvalg/` | `/foreningen/bestyrelsen/` |
| `/bestyrelse-og-udvalg/afloenningspolitik-for-bestyrelsen/` | `/foreningen/regler-og-dokumenter/` |
| `/bestyrelse-og-udvalg/bestyrelsen/` | `/foreningen/bestyrelsen/` |
| `/bestyrelse-og-udvalg/bestyrelsens-udvalg/` | `/foreningen/udvalg-og-arbejdsgrupper/` |
| `/bestyrelse-og-udvalg/bestyrelsesmedlemmer-2/` | `/foreningen/bestyrelsen/` |
| `/bestyrelse-og-udvalg/eksterne-udvalg-og-arbejdsgrupper/` | `/foreningen/udvalg-og-arbejdsgrupper/` |
| `/dokumenter/vedtaegter-paragraf-3-nyt-design/` | `/foreningen/regler-og-dokumenter/` |
| `/groendalsvaenge-socialt/` | `/faellesskab/` |
| `/groendalsvaenge-socialt/aktiviteter-og-faellesskab-i-groendalsvaenge/` | `/faellesskab/aktiviteter-og-klubber/` |
| `/groendalsvaenge-socialt/de-gule-spejdere-i-groendalsvaenge/` | `/faellesskab/aktiviteter-og-klubber/` |
| `/groendalsvaenge-socialt/facebook-sider-for-groendalsvaenge/` | `/faellesskab/groendalsvaenge-paa-facebook/` |
| `/groendalsvaenge-socialt/fester-og-traditioner-i-groendalsvaenge/` | `/faellesskab/fester-og-traditioner/` |
| `/groendalsvaenge-socialt/legepladser-i-groendalsvaenge/` | `/faellesskab/legepladser/` |
| `/groendalsvaenge-socialt/leje-af-lokaler-i-forretningsbygningen/` | `/bo-her/leje-af-lokaler/` |
| `/husorden-fuld/` | `/bo-her/husorden-kort-fortalt/` |
| `/information-om-anmeldelse-og-forebyggelse-af-skader-i-skybruds-og-stormsaesonen/` | `/bo-her/forsikringsskader/` |
| `/internt-2/aarets-andelsoverdragelser/` | `/foreningen/regler-og-dokumenter/` |
| `/internt-2/arkiv-over-groendalsvaenge-nyt/` | `/foreningen/regler-og-dokumenter/` |
| `/internt-2/nyhedsarkiv/` | `/nyheder/` |
| `/internt-2/oversigt-over-andelsvaerdier/` | `/foreningen/regler-og-dokumenter/` |
| `/internt-2/referater-af-bestyrelsesmoeder/` | `/foreningen/regler-og-dokumenter/` |
| `/internt-2/retssager/` | `/foreningen/regler-og-dokumenter/` |
| `/internt-2/stolper-og-stakitter/` | `/bo-her/stolper-og-stakitter/` |
| `/internt-2/ting-til-udlaan-i-foreningen/` | `/bo-her/udlaan-af-faellesudstyr/` |
| `/internt-2/valuarvurdering-for-groendalsvaenge/` | `/foreningen/regler-og-dokumenter/` |
| `/jeg-skal-koebe-stolper-eller-hegn/` | `/bo-her/stolper-og-stakitter/` |
| `/om-foreningen/` | `/om-groendalsvaenge/historie-og-arkitektur/` |
| `/om-foreningen/aarsregnskab/` | `/foreningen/regler-og-dokumenter/` |
| `/om-foreningen/administration/` | `/foreningen/kontakt/` |
| `/om-foreningen/bevarende-lokalplan/` | `/bo-her/planlaegger-du-at-bygge/` |
| `/regulativ-for-ekspektanter/` | `/foreningen/regler-og-dokumenter/` |
