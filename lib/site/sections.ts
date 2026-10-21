/** Navigation lives in code, not in Drive. Every synced section in config/site.json needs an entry. */
export const sectionTexts: Record<string, { label: string; intro: string }> = {
  foreningen: { label: 'Foreningen', intro: 'Om andelsboligforeningen, og hvordan den drives.' },
  vejledninger: { label: 'Vejledninger', intro: 'Praktisk information og hjælp til hverdagen.' },
  dokumenter: { label: 'Dokumenter', intro: 'Hent foreningens dokumenter som PDF.' },
};
export const date = (value: string) => new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
