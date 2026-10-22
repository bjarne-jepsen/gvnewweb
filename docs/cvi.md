# CVI for Grøndalsvænge 2.0

Status: **godkendt 22. oktober 2026**. Visuelt udkast: [`cvi-udkast.html`](cvi-udkast.html). Åbn det direkte i en browser. Det er ikke en del af buildet.

## Udgangspunkt

- Foreningen har i dag intet logo og ingen faste farver. groendalsvaenge.dk bruger standardtemaet Kadence til WordPress med Inter, skifergrå tekst, blå links og et rødt nyhedsmærke. Det eneste særpræg er luftfotoet af de røde tegltage og de grønne haver.
- Valgt retning (oktober 2026): et enkelt bomærke, paletten "Tegl og have", en rolig og lokalhistorisk stemning og en forside uden stort foto.
- Sitet er et oplysningssite for andelshavere og folk udefra. Det skal være let at læse for alle aldre, også på mobilen. Det må ikke ligne en kampagne.

## 1. Bomærke og navn

- **Bomærket** er en hussilhuet med saddeltag i teglrød og en krop i havegrøn med en kalkhvid dør. Det tegnes i et 32×32-gitter med tre flader og ingen streger. Det skal kunne læses ned til 16 px.
- **Navnet** er "Grøndalsvænge" sat i serif med "Andelsboligforeningen" som undertitel i sans-serif. Header og footer bruger samme navn og undertitel.
- På mørk baggrund (footer) står mærket i kalkhvid med en havegrøn dør.
- **Teknik:** mærket ligger som inline SVG i HTML med `aria-hidden="true"`, fordi navnet altid står som tekst ved siden af. Favicon er samme SVG som `data:`-URI i `<link rel="icon">`. Derfor kommer der ingen nye filer i output, og outputkontrollen skal ikke ændres for at tillade dem.
- Mærket må ikke strækkes, roteres, have skygge eller ændre farver ud over de to varianter.

## 2. Farver

| Token | Navn | Hex | Brug |
|---|---|---|---|
| `--color-ink` | Mørkegrøn | `#17251E` | Brødtekst og overskrifter |
| `--color-green` | Havegrøn | `#24513A` | Links, fokusring, footer-baggrund |
| `--color-tegl` | Teglrød | `#A8432A` | Accent: aktiv menu, nyhedsstreg, bomærkets tag |
| `--color-muted` | Grå | `#56625B` | Datoer, ingresser og metadata |
| `--color-paper` | Kalkhvid | `#FAF7F0` | Sidebaggrund |
| `--color-surface` | Halm | `#EFE6D2` | Flader: genveje, tabelhoved |
| `--color-surface-hover` | Mørk halm | `#E7DBC1` | Flader ved hover |
| `--color-line` | Linje | `#D8D0BF` | Dekorative skillelinjer |

**Kontrast (WCAG 2.2 AA):** Al tekst skal have mindst 4,5:1, og fokusringe og andre nødvendige grafiske elementer mindst 3:1. De tilladte kombinationer er målt:

| Forgrund på baggrund | Kalkhvid | Halm | Havegrøn |
|---|---|---|---|
| Mørkegrøn | 14,9 | 12,8 | – |
| Havegrøn | 8,5 | 7,3 | – |
| Teglrød | 5,6 | 4,8 | – |
| Grå | 6,0 | 5,1 | – |
| Kalkhvid | – | – | 8,5 |

- Teglrød bruges sparsomt som streger og markeringer, ikke til store flader eller brødtekst.
- Linjefarven (1,4:1) er kun til pynt. Den må aldrig være det eneste, der viser, at noget kan klikkes, eller hvor en grænse går.
- Links i brødtekst er altid understregede. Farve alene må ikke bære betydning.
- Sitet har kun lyst tema (`color-scheme: light`). Mørkt tema kan komme senere, når tokens er på plads.

## 3. Typografi

Der bruges kun systemfonte. Der er ingen fontfiler og ingen eksterne kald.

| Token | Stak | Brug |
|---|---|---|
| `--font-serif` | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", P052, Georgia, serif` | H1–H3, navnet, genveje |
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Brødtekst, navigation, H4–H6, tabeller, metadata |

Palatino og Iowan giver et klassisk præg, der passer til en haveby fra 1920'erne. Georgia er reserven, hvis de mangler.

| Element | Størrelse | Snit og linjehøjde |
|---|---|---|
| H1 | `clamp(2.25rem, 5vw, 3.5rem)` | Serif 400 / 1,15, højst 20 tegn bredt |
| H2 | `clamp(1.5rem, 3vw, 2rem)` | Serif 400 / 1,15 |
| H3 | 1,35rem | Serif 400 |
| H4–H6 | 1,125rem / 1rem | Sans 650 |
| Brødtekst | 1,125rem (18 px) | Sans 400 / 1,6, højst 68 tegn per linje |
| Ingres | 1,3rem | Sans, grå |
| Metadata | 0,875rem | Sans, grå |

Tekst må ikke stå med versaler, undtagen korte mærkater med spatiering. Kursiv bruges kun til titler på værker.

## 4. Afstande og grid

- Skala: `--space-2xs` .25 · `xs` .5 · `s` .75 · `m` 1 · `l` 1,5 · `xl` 2 · `2xl` 3 · `3xl` 4,5 (rem).
- Sidebredde `--page-max: 72rem`, sidemargin `--gutter: clamp(1rem, 5vw, 3rem)` og tekstbredde `--measure: 68ch`.
- Hjørneradius er `--radius: 4px` på flader, tabeller og billeder. Der er ingen skygger.
- Alt klikbart er mindst 44 px højt på mobilen.
- Ingen vandret rulning af siden ved 320 px bredde. Kun tabeller må rulle vandret, og det sker inden i `.table-scroll`.

## 5. Komponenter

**Header.** Bomærke og navn står til venstre og hovednavigationen til højre. På mobilen brydes menuen over to linjer. Der er ingen hamburgermenu, fordi der er seks punkter og intet JavaScript. Den aktive side markeres med `aria-current="page"` og en teglrød streg på 3 px under punktet. Ved hover vises en linje i linjefarve. Under headeren er der en tynd skillelinje.

**Forside-genveje ("Det vigtigste").** Genvejene står i et grid af halmfarvede fliser, `minmax(15rem, 1fr)`, med tre per række på desktop og én per række på mobilen. Teksten er serif med en havegrøn pil (→) i højre side. Hele flisen er linket. Ved hover bliver fladen lidt mørkere og teksten understreget.

**Nyhedskort ("Seneste nyt" og nyhedslisten).** Hvert kort har en teglrød streg på 3 px foroven. Derefter følger datoen i lille grå skrift, titlen i serif som link og et resumé i grå. På forsiden står tre kort side om side på desktop og under hinanden på mobilen. Linket "Alle nyheder" står under kortene.

**Find rundt og sektionslister.** Sektionerne står i et to-spaltet grid med en tynd linje over hvert punkt. Titlen er serif og et link, og introen står i grå. Sektionssiderne bruger samme mønster i én spalte.

**Indholdsside.** Tilbagelinket "← Til …" står over H1. Brødteksten er højst 68 tegn bred. Til sidst kommer "Opdateret …" som metadata.

**Tabeller.** `.table-scroll` får en tynd ramme og radius. Tabelhovedet har halmfarvet baggrund og fede overskrifter. Rækkerne adskilles af vandrette linjer, og der er ingen lodrette. Containeren kan få fokus (`tabindex="0"`), viser fokusring og ruller vandret på smalle skærme.

**Billeder.** Billeder står i `figure` i fuld tekstbredde med radius. De får aldrig ramme eller skygge.

**Footer.** Footeren har havegrøn baggrund og kalkhvid tekst og links. Den indeholder bomærket i lys variant, footerlinks (Kontakt, Regler og dokumenter) og en kort linje om, at dokumenter ligger i ProBo. Så længe sitet er en prototype, står det også i footeren.

**Fokus.** Fokus vises overalt som `outline: 3px solid var(--color-green)` med 3 px afstand. På footerens grønne baggrund er ringen kalkhvid. "Spring til indhold" er det første element på siden.

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

## Implementeringsplan (efter godkendelse)

Hver leverance laves på sin egen gren, testes og flettes ind i main som fast-forward. Der pushes ikke.

**L1: Tokens, grundtypografi, header og footer**
- Mål: CVI-tokens og basisstil er i brug på alle sider, og bomærke, favicon og footer følger CVI.
- Filer: nye `src/styles/tokens.css` og `src/styles/site.css`, der erstatter `<style is:global>` i `src/layouts/Base.astro`. Ny `src/components/Mark.astro`. `scripts/verify-output.ts`. Nye tests i `tests/cvi.test.ts` og `tests/build.test.ts`.
- Testkriterier:
  - En test læser `tokens.css` og kræver kontrast på mindst 4,5:1 for alle tilladte tekstkombinationer og mindst 3:1 for fokusringen.
  - Outputkontrollen afviser eksterne adresser i CSS (`url(http…)`, `@import`) og i `<link href>` og `src` i HTML. En test viser, at det fanges.
  - `bun test`, `bun run typecheck` og `bun run build` består.
- Risici:
  - Astro samler importeret CSS i `_astro/*.css`, som outputkontrollen allerede tillader. Det skal bekræftes.
  - Den nye kontrol mod eksterne adresser må ikke ramme almindelige `<a href>` til eksterne sider.

**L2: Forsiden**
- Mål: Genvejsfliser, nyhedskort og Find rundt følger CVI.
- Filer: `src/pages/index.astro`, `src/components/Entries.astro` (en variant med kort) og `src/styles/site.css`.
- Testkriterier: Forsiden har stadig præcis tre nyheder og alle genveje. Det tjekkes i den eksisterende site-test eller en ny. Build og outputkontrol består.
- Risici: Lange titler i genveje og kort. Det tjekkes ved 320 px.

**L3: Sektions- og indholdssider**
- Mål: Tilbagelinks, brødtekst, tabeller, figurer og metadata følger CVI. Desuden en enkel printstil, der skjuler navigation og footer.
- Filer: `src/pages/[section]/index.astro`, `src/pages/[section]/[slug].astro` og `src/styles/site.css`.
- Testkriterier: Build og outputkontrol består. Siderne gennemgås i browseren ved 320, 768 og 1280 px.
- Risici: Indhold fra Drive med usædvanlige tabeller eller dybe overskrifter (H5–H6).

**L4: Tilgængelighedsgennemgang**
- Mål: Bekræfte, at sitet er brugbart med tastatur, ved 200 % zoom og ved 320 px bredde. Ret det, der findes.
- Testkriterier: Hele forløbet "Færdig" er opfyldt, og `docs/cvi.md` markeres som godkendt og gennemført.

## Antagelser

- Ingen skrifttypefiler og intet forsidefoto. Derfor skal outputkontrollen ikke have nye tilladte filer.
- Teksten "Lokal prototype" og `noindex` bliver stående, indtil sitet skal i drift.
- Redirect-siderne (`[...from].astro`) får ingen stil, fordi de straks sender videre.
