export interface ReportEntry { section: string; title: string; id?: string; message?: string }
export interface SyncReport {
  startedAt: string;
  added: ReportEntry[]; changed: ReportEntry[]; removed: ReportEntry[];
  /** New, changed and removed section folders (name, number, type or intro). */
  sections: ReportEntry[];
  unchanged: number; warnings: ReportEntry[]; errors: ReportEntry[];
}
export const emptyReport = (startedAt: string): SyncReport =>
  ({ startedAt, added: [], changed: [], removed: [], sections: [], unchanged: 0, warnings: [], errors: [] });
export const hasChanges = (r: SyncReport) => r.added.length + r.changed.length + r.removed.length + r.sections.length > 0;

const line = (e: ReportEntry) => `- ${e.section}: ${e.title.replace(/\s+/g, ' ')}${e.message ? ` — ${e.message}` : ''}`;
/** Git commit message for a run that changed content/: what was added, changed and removed. */
export function commitMessage(r: SyncReport) {
  const out = [`content: synkronisering ${r.startedAt.slice(0, 10)} (${r.added.length} nye, ${r.changed.length} ændrede, ${r.removed.length} fjernede)`, ''];
  for (const [heading, entries] of [['Nye', r.added], ['Ændrede', r.changed], ['Fjernede', r.removed]] as const) {
    if (entries.length) out.push(`${heading}:`, ...entries.map(e => line({ ...e, message: undefined })), '');
  }
  if (r.sections.length) out.push('Sektioner:', ...r.sections.map(line), '');
  if (r.errors.length || r.warnings.length) out.push(`${r.errors.length} fejl og ${r.warnings.length} advarsler; se rapporten fra kørslen.`);
  return out.join('\n').trimEnd() + '\n';
}
/** Short editor-facing summary; names only files already inside the website's folders. */
export function renderReport(r: SyncReport) {
  const out = [`# Synkronisering ${r.startedAt}`, '',
    `${r.added.length} nye, ${r.changed.length} ændrede, ${r.removed.length} fjernede, ${r.unchanged} uændrede. ${r.warnings.length} advarsler, ${r.errors.length} fejl.`, ''];
  for (const [heading, entries] of [['Fejl', r.errors], ['Advarsler', r.warnings], ['Sektioner', r.sections], ['Nye', r.added], ['Ændrede', r.changed], ['Fjernede', r.removed]] as const) {
    if (entries.length) out.push(`## ${heading}`, '', ...entries.map(line), '');
  }
  return out.join('\n');
}
