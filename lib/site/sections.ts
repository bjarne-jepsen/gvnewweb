/** Navigation lives in code, not in Drive. Every synced section in config/site.json needs an entry. */
export const sectionTexts: Record<string, { label: string; intro: string }> = {
  foreningen: { label: 'Foreningen', intro: 'Om andelsboligforeningen, og hvordan den drives.' },
  vejledninger: { label: 'Vejledninger', intro: 'Praktisk information og hjælp til hverdagen.' },
  nyheder: { label: 'Nyheder', intro: 'Nyt fra foreningen.' },
};
/** Long Danish date. Calendar dates (YYYY-MM-DD) are shown as that day, timestamps in Copenhagen time. */
export const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
  : new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
/** The calendar day in Copenhagen at a given instant, as YYYY-MM-DD. */
export const copenhagenDay = (at: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(at);
