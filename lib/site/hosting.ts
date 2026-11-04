import type { Site } from './load';

/** Host rules for Cloudflare Pages: real 301s for every redirect page and no indexing.
 * Pages reads _redirects and _headers instead of serving them, and a redirect wins over a file.
 * The meta-refresh pages stay in the output as a fallback on other hosts. */
export function hostFiles(site: Pick<Site, 'redirects'>): Map<string, string> {
  // Both spellings of an old address: with and without the trailing slash.
  const redirects = site.redirects.flatMap(r => [`${r.from.slice(0, -1)} ${r.to} 301`, `${r.from} ${r.to} 301`]);
  return new Map([
    ['_redirects', ['# Skrevet af buildet (lib/site/hosting.ts). Ret ikke i hånden.', ...redirects, ''].join('\n')],
    ['_headers', ['# Skrevet af buildet (lib/site/hosting.ts). Ret ikke i hånden.', '/*', '  X-Robots-Tag: noindex, nofollow', ''].join('\n')],
  ]);
}
