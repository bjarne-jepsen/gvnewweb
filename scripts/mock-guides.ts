import { sealRecord } from '../lib/contracts/content';

/** Curated paraphrases, not a live importer. Sources inspected 20 October 2026.
 * Imported public text stays mock data and requires a mock snapshot approval.
 * updatedAt denotes fixture preparation, not a claimed source modification date. */
const examples = [
  {
    id: 'guide-boligsalg', slug: 'hvordan-saelger-jeg-mit-hus', title: 'Hvordan sælger jeg mit hus?', category: 'Foreningen',
    summary: 'Start salgsforløbet med Vurderingsudvalget og få overblik over dine næste skridt.',
    sourceUrl: 'https://groendalsvaenge.dk/andelshaveren/hvordan-saelger-jeg-mit-hus/',
    body: '## Begynd hos Vurderingsudvalget\n\nForeningens hjemmeside beskriver Vurderingsudvalget som det første kontaktpunkt, når du vil sælge din andelsbolig. Udvalget kan hjælpe med at afklare forløbet og dine opgaver som sælger.\n\n## Få overblik før salget\n\n- Tag kontakt til udvalget, inden du går videre med salget.\n- Aftal et indledende møde.\n- Brug mødet til at gennemgå processen og forventningerne til dig.\n\nKontaktoplysninger og henvisningen til administratorens salgsvejledning findes på originalsiden.',
  },
  {
    id: 'guide-ventelister', slug: 'ventelister', title: 'Ventelister i Grøndalsvænge', category: 'Foreningen',
    summary: 'Læs om Ekspektancelisten, Internlisten og tilmelding gennem Waitly.',
    sourceUrl: 'https://groendalsvaenge.dk/andelshaveren/ekspektance-og-internliste/',
    body: '## To forskellige ventelister\n\nHjemmesiden beskriver en Ekspektanceliste for personer med tilknytning til foreningen og en Internliste for nuværende andelshavere, som ønsker en anden bolig. Der er ikke en almindelig ekstern liste for personer uden tilknytning.\n\n## Ekspektancelisten\n\nListen omfatter blandt andre bestemte familiemedlemmer til nuværende eller tidligere beboere samt tidligere andelshavere. Siden angiver en aldersgrænse på 18 år.\n\n## Internlisten\n\nFor nuværende andelshavere angiver siden mindst tre års ejerskab som betingelse for opskrivning. Internlisten har fortrinsret frem for Ekspektancelisten.\n\n## Tilmelding og placering\n\nListerne administreres i Waitly, hvor du kan følge din placering via din profil. Bestyrelsen kontrollerer tilmeldingerne. Se den fulde beskrivelse af kriterierne og de konkrete tilmeldingslinks på originalsiden.',
  },
  {
    id: 'guide-byggeprojekter', slug: 'byggeprojekter', title: 'Planlægger du at bygge?', category: 'Bolig og vedligehold',
    summary: 'Forbered dit byggeprojekt med rådgivning, lokalplan og hjælp til håndværkeraftalen.',
    sourceUrl: 'https://groendalsvaenge.dk/andelshaveren/byggeprojekter/',
    body: '## Få rådgivning tidligt\n\nForeningens byggeside anbefaler professionel byggerådgivning, før du søger byggetilladelse. Det hjælper dig med at få overblik over kravene til projektet.\n\n## Udvendige arbejder\n\nVed eksempelvis vinduer og tag fremhæver siden, at håndværkeren skal kende lokalplanens krav. Siden henviser også til forslag til aftalen med håndværkeren.\n\n- Gennemgå projektet med en byggerådgiver.\n- Gør kravene til arbejdet tydelige i håndværkeraftalen.\n- Brug Byggeudvalget som kontaktpunkt for spørgsmål.\n\n## Materialer og inspiration\n\nOriginalsiden samler links til lokalplan, kontraktvejledning, tidligere byggetilladelser og anbefalede håndværkere. Vejledningen erstatter ikke dit eget ansvar for arbejdet.',
  },
  {
    id: 'guide-forsikringsskader', slug: 'forsikringsskader', title: 'Anmeldelse af forsikringsskader', category: 'Bolig og vedligehold',
    summary: 'Find den beskrevne vej til skadeanmeldelse og se, hvor kontaktoplysningerne står.',
    sourceUrl: 'https://groendalsvaenge.dk/andelshaveren/anmeldelse-af-forsikringsskader/',
    body: '## Hvem modtager anmeldelsen?\n\nForeningens hjemmeside beskriver en forsikringsaftale hos Gjensidige med Howden som mægler. Glasskader er også omfattet af den beskrevne ordning.\n\n## I og uden for telefontiden\n\n- I almindelig telefontid henviser siden til Howden.\n- Uden for telefontiden henviser siden til Gjensidige og beder om efterfølgende kontakt til Howden.\n\nSe de konkrete telefonnumre og åbningstider på originalsiden, inden du kontakter selskaberne.\n\n## Find forsikringsmaterialet\n\nOriginalsiden indeholder også en henvisning til policen og oplysninger om den beskrevne dækning. Policen er ikke importeret til denne prototype.',
  },
  {
    id: 'guide-renovation', slug: 'renovation', title: 'Renovation og affald', category: 'Bolig og vedligehold',
    summary: 'Find vej til tømmekalenderen og hjælp, hvis affaldet ikke bliver hentet.',
    sourceUrl: 'https://groendalsvaenge.dk/andelshaveren/renovation/',
    body: '## Affaldsafhentning\n\nKøbenhavns Kommune håndterer ifølge foreningens hjemmeside afhentning af dagrenovation og storskrald i området.\n\n## Hvis afhentningen mangler\n\nSpørgsmål og manglende afhentning skal rettes til kommunen. Originalsidens links fører til kommunens kontaktoplysninger.\n\n## Se datoerne for din adresse\n\nVia kommunens hjemmeside kan du slå adressen op og finde planlagte afhentninger af blandt andet storskrald, haveaffald og hårde hvidevarer. Prototypen henter ikke en personlig tømmekalender.\n\n## Beholdere og opkrævning\n\nSiden fremhæver, at andelshaveren selv skal bestille ændringer af beholderstørrelsen, følge op på levering og kontrollere, at afgiften svarer til beholderen.',
  },
  {
    id: 'guide-lokaleleje', slug: 'leje-af-lokaler', title: 'Leje af lokaler i foreningsbygningen', category: 'Fællesskab',
    summary: 'Få overblik over de to lokaler, faciliteterne og den beskrevne bookingproces.',
    sourceUrl: 'https://groendalsvaenge.dk/groendalsvaenge-socialt/leje-af-lokaler-i-groendalsvaenge-fritidsforening/',
    body: '## Plads til dit arrangement\n\nHjemmesiden beskriver to lokaler i foreningsbygningens stueetage, som beboere kan leje hver for sig eller samlet. Det ene er angivet til 40 personer og det andet til 50.\n\n## Faciliteter\n\n- Køkken med service.\n- Borde og stole.\n- Adgang til toiletter.\n\nLokalerne beskrives som egnede til blandt andet familiefester. Udlejning sker især i weekenderne, men øvrige ugedage kan også være en mulighed.\n\n## Sådan foregår booking\n\nOriginalsiden beskriver booking ved personligt fremmøde i Fritidsforeningens kontortid, mandag kl. 19–20. Her aftales praktiske forhold og betaling.\n\nSe originalsiden for bookingoplysninger. Prototypen har ingen bookingfunktion og viser ikke aktuel ledighed.',
  },
];

export const realisticGuides = examples.map(example => sealRecord({
  schemaVersion: 1, id: example.id, type: 'guide', title: example.title,
  summary: example.summary, slug: example.slug, category: example.category, visibility: 'public',
  updatedAt: '2026-10-20T10:15:00Z',
  source: { provider: 'mock', sourceId: example.sourceUrl, sourceRevision: 'curated-2026-10-20' },
  relatedDocumentIds: [],
  bodyMarkdown: `${example.body}\n\n## Kilde og prøveindhold\n\nDette er en forkortet, bearbejdet prøveversion til den lokale prototype, klargjort 20. oktober 2026.\n\n[Se originalsiden på groendalsvaenge.dk](${example.sourceUrl})`,
}));
