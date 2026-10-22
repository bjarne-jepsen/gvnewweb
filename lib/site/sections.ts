/** Navigation lives in code, not in Drive. Every synced section in config/site.json needs an entry. */
export const sectionTexts: Record<string, { label: string; intro: string }> = {
  'om-groendalsvaenge': { label: 'Om Grøndalsvænge', intro: 'Historien, husene og kvarteret, og hvordan man får et hus i Grøndalsvænge.' },
  'bo-her': { label: 'Bo her', intro: 'Praktisk information til andelshavere om byggeri, salg, skader, affald og fællesudstyr.' },
  faellesskab: { label: 'Fællesskab', intro: 'Fester og traditioner, klubber og aktiviteter, legepladser og grupper på Facebook.' },
  foreningen: { label: 'Foreningen', intro: 'Bestyrelse, udvalg, generalforsamling, regler og kontakt.' },
  nyheder: { label: 'Nyheder', intro: 'Nyt fra foreningen.' },
};

/** Front-page shortcuts and footer links. A path that does not exist (yet) is left out with a
 * build warning, so the list can name pages before the editors have written them. */
export const frontpage = {
  intro: 'Grøndalsvænge er en andelsboligforening med 389 fritliggende huse, bygget 1914–1928 på grænsen mellem Vanløse og København NV.',
  shortcuts: [
    { label: 'Kontakt', path: '/foreningen/kontakt/' },
    { label: 'Sådan får du et hus', path: '/om-groendalsvaenge/saadan-faar-du-et-hus/' },
    { label: 'Sælg dit hus', path: '/bo-her/saelg-dit-hus/' },
    { label: 'Planlægger du at bygge?', path: '/bo-her/planlaegger-du-at-bygge/' },
    { label: 'Forsikringsskader', path: '/bo-her/forsikringsskader/' },
    { label: 'Affald og renovation', path: '/bo-her/affald-og-renovation/' },
  ],
  footer: [
    { label: 'Kontakt', path: '/foreningen/kontakt/' },
    { label: 'Regler og dokumenter', path: '/foreningen/regler-og-dokumenter/' },
  ],
};
/** Long Danish date. Calendar dates (YYYY-MM-DD) are shown as that day, timestamps in Copenhagen time. */
export const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
/** The calendar day in Copenhagen at a given instant, as YYYY-MM-DD. */
export const copenhagenDay = (at: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(at);
