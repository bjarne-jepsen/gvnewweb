# CVI for Grøndalsvænge 2.0

Status: **version 2, november 2026.** Bygger på Bjarnes mockup "Sådan får du et hus". Den afløser version 1 (godkendt 22. oktober 2026, visuelt udkast i [`cvi-udkast.html`](cvi-udkast.html), som nu er historisk). Afsnittet "Gennemførelse" længere nede beskriver version 1.

## Udgangspunkt

- Foreningen har i dag intet logo og ingen faste farver. groendalsvaenge.dk bruger standardtemaet Kadence til WordPress med Inter, skifergrå tekst, blå links og et rødt nyhedsmærke. Det eneste særpræg er luftfotoet af de røde tegltage og de grønne haver.
- Valgt retning (oktober 2026): et enkelt bomærke, paletten "Tegl og have", en rolig og lokalhistorisk stemning og en forside uden stort foto. I november 2026 fik forsiden en tegning af husene i stedet (se "Forsidetegning").
- Sitet er et oplysningssite for andelshavere og folk udefra. Det skal være let at læse for alle aldre, også på mobilen. Det må ikke ligne en kampagne.

## 1. Navn

- **Navnet** står som "Andelsboligforeningen Grøndalsvænge": "Andelsboligforeningen" i fed sans-serif foran "Grøndalsvænge" som lille mærkat med versaler og spatiering. Navnet linker til forsiden, så menuen har intet punkt "Forside".
- Footeren har navnet sat meget stort (op til 8rem) i normal vægt.
- Version 2 har **intet bomærke** i header og footer, ligesom mockuppen. Favicon er stadig en lille hussilhuet som `data:`-URI, nu i blæk, grøn og hvid.

## 2. Farver

| Token | Navn | Hex | Brug |
|---|---|---|---|
| `--color-ink` | Blæk | `#141414` | Brødtekst, overskrifter, links, streg over H2 |
| `--color-green` | Grøn | `#1E4636` | Links ved hover, knap, fokusring, pile, panelerne "Det vigtigste" og "På denne side" |
| `--color-muted` | Grå | `#5C5C5C` | Datoer, brødkrumme og metadata |
| `--color-paper` | Hvid | `#FFFFFF` | Sidebaggrund, tekst på knap |
| `--color-surface` | Lys grå | `#F2F2EE` | Flader: genveje |
| `--color-surface-hover` | Grå flade | `#E6E6E0` | Flader ved hover |
| `--color-line` | Linje | `#DADAD4` | Dekorative skillelinjer |
| `--color-dark` | Mørk | `#141414` | Footer-baggrund |
| `--color-on-dark` | Lys | `#F2F2EE` | Tekst og links i footeren |
| `--color-on-dark-muted` | Lys grå | `#A8A8A2` | Mærkater og sekundær tekst i footeren |
| `--color-dark-line` | Mørk linje | `#4A4A4A` | Skillelinje i footeren |

Teglrød er udgået. `tests/cvi.test.ts` måler, at al tekst har mindst 4,5:1 og fokusringe mindst 3:1 (WCAG 2.2 AA) for de tilladte kombinationer: blæk, grøn og grå på hvid og lys grå; blæk på grå flade; hvid på grøn og blæk; lys og lys grå på mørk.

- Links i brødtekst er altid understregede. Farve alene må ikke bære betydning.
- Links med en pil (← tilbage, → videre) har ingen understregning. Pilen er tegnet på, at det er et link. Ved hover bliver linket grønt, og pilen rykker lidt.
- Linjefarven er kun til pynt.
- Sitet har kun lyst tema (`color-scheme: light`).

## 3. Typografi

Der bruges kun systemfonte: `--font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif`. Der er ingen serif, ingen fontfiler og ingen eksterne kald. På Windows og Linux uden Helvetica bliver det Arial eller systemets sans-serif.

| Element | Størrelse | Snit og linjehøjde |
|---|---|---|
| H1 | `clamp(2.5rem, 1.4rem + 4vw, 4.75rem)` | 400 / 1,02, spatiering −0,035em |
| H2 | 1,875rem | 700 / 1,15, −0,02em. I brødtekst med en streg i blæk over |
| H3 | 1,25rem | 700 / 1,3 |
| H4–H6 | 1,125rem / 1rem | 700 |
| Brødtekst | 1,125rem (18 px) | 400 / 1,6 |
| Ingres | 1,375rem | 400 / 1,45, blæk |
| Metadata | 0,875rem | Grå |

## 4. Afstande og grid

- Skala: `--space-2xs` .25 · `xs` .5 · `s` .75 · `m` 1 · `l` 1,5 · `xl` 2 · `2xl` 3 · `3xl` 4,5 (rem).
- Sidebredde `--page-max: 82.5rem` (1320 px), sidemargin `--gutter: clamp(1.25rem, 4vw, 3.75rem)`. Indholdssider er højst `--content-max: 45rem` (720 px) brede.
- Hjørneradius er 0 (`--radius`). Eneste undtagelse er knappen, som er helt rund i enderne. Der er ingen skygger.
- Alle selvstændige links og knapper er mindst 44 px høje. Links i løbende tekst er undtaget.
- Ingen vandret rulning af siden ved 320 px bredde. Kun tabeller må rulle vandret inden i `.table-scroll`.

## 5. Komponenter

**Header.** Navnet til venstre, hovednavigationen til højre. Ingen hamburgermenu og intet JavaScript. Den aktive side og hover vises med en understregning på 2 px.

**Søgefelt.** Ingen ramme. Feltet står på den lysegrå flade (`--color-surface`) med et lille gråt forstørrelsesglas, så det stadig ses som et felt. Ved hover bliver fladen en tone mørkere. Ved fokus bliver feltet hvidt og får den grønne fokusring på 3 px.

**Indholdsside.** Øverst en brødkrumme: sektion / sidens titel. Så H1 og ingressen (dokumentets første afsnit) i stor skrift. Hver H2 har en streg i blæk over sig. Eksterne links får en ↗ efter sig, og links til PDF får "(PDF)". Siden slutter med en linje, "Opdateret …" og en grøn knap "Kontakt foreningen" til siden med adressen `…/kontakt/`. Knappen vises ikke på selve kontaktsiden, eller hvis siden ikke findes.

**På denne side.** En side med mindst tre H2 får et grønt panel med sidens H2 som links, i samme stil som "Det vigtigste" på forsiden: hvid tekst, linjer imellem og en pil ned. Punkterne står i normal vægt (400), kun overskriften "På denne side" er fed. På smalle skærme står panelet under ingressen. Fra 64rem står det i en spalte til højre for teksten og bliver stående, når man scroller. Hver H2 får et id ud fra sin tekst (`lib/site/render.ts`), og layoutets egne id'er er reserveret. Nyheder får intet panel. Ved print skjules det. Højst én grøn flade pr. side: forsiden har "Det vigtigste", indholdssiderne "På denne side".

**Tabeller.** Ingen ramme og ingen flade. Tabelhovedet er fedt med en streg i blæk under, rækkerne adskilles af tynde linjer.

**Billeder.** I fuld tekstbredde, uden radius, ramme eller skygge.

**Forside.** Øverst "Velkommen" meget stort med ingressen til højre, på himlen i forsidetegningen. Derunder to spalter (fra 60rem): til venstre "Seneste nyt" med de tre nyeste nyheder som en liste. Alle nyheder har samme størrelse med dato, titel og resumé; til højre "Det vigtigste" som et grønt panel med hvide links på linjer og en pil. Begge spalter ligger over plænen i tegningen; nyhederne står derfor på en hvid flade. På smalle skærme står nyhederne først og panelet under. Spalteoverskrifterne er små versaler med spatiering. Hvid tekst på grøn er en af de godkendte kombinationer, og fokusringen er hvid i panelet.

**Forsidetegning.** En tegning af en række huse, som de ser ud i Grøndalsvænge: halvanden etage, stejle tegltage, pudsede facader, hække og træer. Den fylder toppen af forsiden. Himlen går op bag headeren og "Velkommen", husene står under ingressen, og "Seneste nyt" og "Det vigtigste" ligger over plænen. Tegningen er `src/components/Scene.astro`, farver og regler står i `lib/site/sky.ts`.
- **Tid på døgnet** følger solen over Grøndalsvænge, ikke klokken: dag, når solen står mere end 6° over horisonten, nat, når den står mere end 6° under, og skumring imellem. Om natten er himlen natteblå med måne og stjerner, husene er mørkere, og omkring to tredjedele af vinduerne lyser. I skumringen er himlen varm forneden, og vinduerne lyser.
- **Vejret** kommer fra Open-Meteo: klart, overskyet, regn, sne eller tåge. Kun himlen og lyset ændrer sig. Browseren spørger kun sitet selv (`/api/vejr`). En Cloudflare Pages-funktion (`functions/api/vejr.ts`) henter vejret for et fast punkt (55,69, 12,50) og gemmer svaret en halv time. Den besøgendes IP-adresse sendes altså ikke til Open-Meteo. Uden svar, lokalt og uden JavaScript er det klart vejr.
- **Kilde:** Open-Meteo er gratis til ikke-kommerciel brug (CC BY 4.0). Når vejret vises, står "Vejrdata fra Open-Meteo.com" under nyhederne.
- **Tekst på himlen** er blæk om dagen og i skumringen og lys (`--color-on-dark`) om natten, også fokusringen. `tests/sky.test.ts` tjekker, at alle himmelfarver giver mindst 4,5:1. Den lille mærkat "Grøndalsvænge" står i blæk på forsiden, fordi grå ikke har kontrast nok på himlen.
- **Dyr** (`src/components/SceneAnimals.astro`) følger samme skift som himlen. Om dagen og i skumringen sidder der en fugl i træet og en kat på hækken, og en hund står i en låge. En anden fugl flyver ind og lander på en skorsten. Om natten sidder to ugler i et træ, og en ræv lusker ind og stopper i den anden låge. Dyrene får lyset svagere end husene, så de stadig kan ses om natten, og øjnene lyser.
- **Bevægelse:** Fuglen og ræven kommer ind, når siden åbner. Derefter bevæger hvert dyr sig lidt med lange pauser: fuglen hopper, katten svirper med halen, hunden logrer og lægger hovedet på skrå, uglerne blinker og drejer hovedet, og ræven snuser og svinger halen. Regn og sne står stille. Med "reducér bevægelse" i styresystemet står alt stille. Der er bevidst ingen "Stop bevægelse"-knap. Bevægelsen er så lille og sjælden, at Bjarne har accepteret afvigelsen fra WCAG 2.2.2 (november 2026).
- Tegningen er pynt og skjult for skærmlæsere. Vejret står i ord i noten under nyhederne.
- `?tid=nat` og `?vejr=regn` (også `dag`, `skumring`, `klart`, `skyet`, `sne`, `taage`) viser en anden himmel, så man kan se tegningen i alle tilstande.

**Landingssider (sektioner).** Sektionens navn står meget stort (`--text-display`, op til 6rem, 400 / 0,95) med første afsnit af `_intro` til højre (fra 50rem, ellers under) og en streg i blæk under. Navnet orddeles ikke. Første afsnit er en kort ingres på højst cirka 200 tegn; synkroniseringen advarer, hvis det er længere. Resten af `_intro` står som løbende tekst under stregen, venstrestillet under titlen og højst 40rem bred. Teksten kan have mellemrubrikker, fed og links. Alle overskrifter i `_intro` bliver H2 på landingssiden, uanset niveau i Docs, i almindelig H2-størrelse; en overskrift før første afsnit vises ikke, fordi første afsnit står ved titlen. Et link til et Google-dokument bliver et link til dokumentets side, og et link til en sektionsmappe i Drive bliver et link til sektionens landingsside. Links til noget, der ikke er på hjemmesiden, bliver almindelig tekst. Hele teksten må højst være 2000 tegn. Der er ingen kort eller liste over undersider: menuen viser allerede alle sider, og teksten linker til de vigtigste. Nyhedssektionen beholder sine nyhedskort.


**Footer.** Mørk baggrund med navnet sat stort, derefter en linje og to kolonner: "Genveje" (footerlinks) og "For andelshavere" (ProBo og prototype-teksten).

**Fokus.** `outline: 3px solid var(--color-green)` med 3 px afstand. I footeren er ringen lys.

## 6. Ikoner

- Der bruges ikke noget ikonbibliotek eller nogen ikonfont. Retningspile er Unicode-tegn: → for "gå videre" og ← for "tilbage".
- Hvis der senere skal bruges flere ikoner, skal de være inline SVG med `currentColor`, en streg på 1,5 px i et 24-gitter og `aria-hidden="true"`. De må aldrig stå uden tekst.

## 7. Billeder

- **Alt-tekst er obligatorisk.** Synkroniseringen afviser allerede billeder uden alternativ tekst (`lib/sync/sync.ts`, `lib/contracts/blocks.ts`). Det fortsætter.
- God alt-tekst beskriver det, billedet viser, og hvorfor det er med, typisk i én sætning. Skriv ikke "billede af". Gentag ikke overskriften.
- Billeder kommer kun fra Drive-dokumenterne. Der er ingen faste designfotos og intet forsidefoto.
- Foretræk fotos fra Grøndalsvænge: huse, haver, veje og fællesarrangementer. Brug ikke stockfotos. Genkendelige personer kræver deres samtykke.
- Billeder vises i deres egne proportioner. De beskæres ikke, og der lægges ikke filtre eller tekst ovenpå.

## 8. Tone

Teksten skal være kort, venlig og konkret. Skriv "du" til læseren og "vi" eller "foreningen" om afsenderen. Undgå forkortelser, som folk udefra ikke kender, eller skriv dem ud første gang. Følg principperne for klart sprog.

---

## Gennemførelse

CVI'en er bygget i fire leverancer. Hver leverance blev lavet på sin egen gren og flettet ind i main som fast-forward. Intet er pushet.

| Leverance | Indhold |
|---|---|
| L1 | `src/styles/tokens.css` og `site.css`, bomærke (`src/components/Mark.astro`), favicon som `data:`-URI, header og footer. Outputkontrollen afviser eksterne ressourcer, og `tests/cvi.test.ts` tjekker kontrasten i farvetokens. |
| L2 | Forsiden: genvejsfliser, nyhedskort og Find rundt i to spalter. |
| L3 | Sektions- og indholdssider: tilbagelinks, brødtekst, tabeller, figurer, nyhedskort i nyhedssektionen og printstil. |
| L4 | Gennemgang af tilgængelighed og rettelse af fund (se nedenfor). |

**Tilgængelighedsgennemgang (L4).** Alle 32 sider i sitemap'en er tjekket ved 320 og 1024 px:
- Ingen sider ruller vandret. Kun tabeller ruller inden i deres egen boks.
- Hver side har præcis én H1 og springer ingen overskriftsniveauer over.
- Ingen billeder mangler alt-tekst, og der er ingen tomme links.
- Alle selvstændige links er mindst 44 px høje.

**Tastatur.** "Spring til indhold" er det første element og vises ved fokus. Tab-rækkefølgen følger siden, og alle links har en synlig fokusring på 3 px. Den er havegrøn på lys baggrund og kalkhvid i footeren.

**200 % zoom.** Det er tjekket som 640 × 400 px, svarende til en skærm på 1280 × 800. Indholdet flyder om uden tab. Afstandene i headeren er strammet på smalle skærme.

**Print.** Det er tjekket som PDF fra Chrome. Navigation og footer er skjult, teksten står i venstre margen, og adressen på eksterne links står efter linket.

**Fund og rettelser i L4:**
- Titellinks i lister, "Alle nyheder", tilbagelink og footerlinks var 22–42 px høje. Nu er de mindst 44 px.
- Headeren fyldte næsten halvdelen af skærmen ved 200 % zoom. Afstandene er strammet.
- Ved print var teksten rykket ind i forhold til navnet, og adressen efter et link var understreget. Begge dele er rettet.

**Ikke tjekket:**
- Billeder og tabeller fra rigtigt Drive-indhold, fordi indholdet ikke har nogen endnu. Tabelstilen er kun tjekket med en tabel, der blev indsat midlertidigt.
- Skærmlæsere (VoiceOver, NVDA) og Windows' tilstand for høj kontrast.

## Antagelser

- Ingen skrifttypefiler og intet forsidefoto. Derfor skal outputkontrollen ikke have nye tilladte filer.
- Teksten "Lokal prototype" og `noindex` bliver stående, indtil sitet skal i drift.
- Redirect-siderne (`[...from].astro`) får ingen stil, fordi de straks sender videre.
