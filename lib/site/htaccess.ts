import type { Site } from './load';

const escape = (path: string) => path.replace(/[.\\+*?[^\]$(){}|]/g, '\\$&');
/** Apache configuration for the web host (Simply): real 301s for every redirect page and no indexing.
 * The meta-refresh pages stay in the output as a fallback for hosts that ignore .htaccess.
 * RedirectMatch is anchored at both ends, so an old path never catches the pages below it. */
export function htaccess(site: Pick<Site, 'redirects'>): string {
  return [
    '# Skrevet af buildet (lib/site/htaccess.ts). Ret ikke i hånden.',
    '<IfModule mod_headers.c>',
    '  Header set X-Robots-Tag "noindex, nofollow"',
    '</IfModule>',
    ...site.redirects.map(r => `RedirectMatch 301 "^${escape(r.from.slice(0, -1))}/?$" "${r.to}"`),
    '',
  ].join('\n');
}
