export interface ReportEntry { section: string; title: string; id?: string; message?: string }
export interface SyncReport {
  startedAt: string;
  added: ReportEntry[]; changed: ReportEntry[]; removed: ReportEntry[];
  unchanged: number; warnings: ReportEntry[]; errors: ReportEntry[];
  skippedSections: string[];
}
export const emptyReport = (startedAt: string): SyncReport =>
  ({ startedAt, added: [], changed: [], removed: [], unchanged: 0, warnings: [], errors: [], skippedSections: [] });
export const hasChanges = (r: SyncReport) => r.added.length + r.changed.length + r.removed.length > 0;

const line = (e: ReportEntry) => `- ${e.section}: ${e.title}${e.message ? ` — ${e.message}` : ''}`;
/** Short editor-facing summary; names only files already inside the website's folders. */
export function renderReport(r: SyncReport) {
  const out = [`# Synkronisering ${r.startedAt}`, '',
    `${r.added.length} nye, ${r.changed.length} ændrede, ${r.removed.length} fjernede, ${r.unchanged} uændrede. ${r.warnings.length} advarsler, ${r.errors.length} fejl.`, ''];
  for (const [heading, entries] of [['Fejl', r.errors], ['Advarsler', r.warnings], ['Nye', r.added], ['Ændrede', r.changed], ['Fjernede', r.removed]] as const) {
    if (entries.length) out.push(`## ${heading}`, '', ...entries.map(line), '');
  }
  if (r.skippedSections.length) out.push(`Ikke synkroniseret endnu: ${r.skippedSections.join(', ')}.`, '');
  return out.join('\n');
}
