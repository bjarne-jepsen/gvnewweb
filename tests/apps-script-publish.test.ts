import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

// Runs the real Apps Script source with fake Google services.
const source = await readFile('scripts/apps-script/publicer.gs', 'utf8');
function run(o: { email: string; props: Record<string, string>; status?: number }) {
  const alerts: string[] = [], calls: { url: string; options: { headers: Record<string, string>; payload: string } }[] = [];
  const services = {
    SpreadsheetApp: { getUi: () => ({ alert: (m: string) => alerts.push(m) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => o.props[k] ?? null }) },
    Session: { getActiveUser: () => ({ getEmail: () => o.email }) },
    UrlFetchApp: { fetch: (url: string, options: (typeof calls)[number]['options']) => { calls.push({ url, options }); return { getResponseCode: () => o.status ?? 204 }; } },
  };
  new Function(...Object.keys(services), `${source}\npublish();`)(...Object.values(services));
  return { alerts, calls };
}
const props = { GITHUB_REPO: 'bjarne-jepsen/gvnewweb', GITHUB_TOKEN: 'github_pat_x', ALLOWED_EMAILS: 'admin@groendalsvaenge.dk, Redaktor@Groendalsvaenge.dk' };

test('kun tilladte adresser kan starte en opdatering; kaldet går til repository_dispatch', () => {
  const ok = run({ email: 'redaktor@groendalsvaenge.dk', props });
  expect(ok.calls).toHaveLength(1);
  expect(ok.calls[0]!.url).toBe('https://api.github.com/repos/bjarne-jepsen/gvnewweb/dispatches');
  expect(ok.calls[0]!.options.headers.Authorization).toBe('Bearer github_pat_x');
  expect(JSON.parse(ok.calls[0]!.options.payload)).toEqual({ event_type: 'publish', client_payload: { requested_by: 'redaktor@groendalsvaenge.dk' } });
  expect(ok.alerts[0]).toContain('startet');
  for (const email of ['anden@groendalsvaenge.dk', '']) {
    const denied = run({ email, props });
    expect(denied.calls).toHaveLength(0);
    expect(denied.alerts).toEqual(['Du har ikke adgang til at publicere hjemmesiden.']);
  }
});
test('manglende opsætning og afvist token giver en forklaring', () => {
  const email = 'admin@groendalsvaenge.dk';
  expect(run({ email, props: { ...props, GITHUB_TOKEN: '' } }).calls).toHaveLength(0);
  expect(run({ email, props: { ...props, GITHUB_REPO: 'x/y/../z' } }).calls).toHaveLength(0);
  expect(run({ email, props, status: 401 }).alerts[0]).toContain('udløbet');
  expect(run({ email, props, status: 500 }).alerts[0]).toContain('kunne ikke startes');
});
