import { WEATHER_URL, parseWeather } from '../../lib/site/sky';

/** GET /api/vejr: the weather in Grøndalsvænge for the front page drawing, as {"vejr": "regn"} or {"vejr": null}.
 * A Cloudflare Pages Function, deployed with dist/ by `wrangler pages deploy`. It exists so the visitor's
 * browser never talks to the weather service: Open-Meteo only sees Cloudflare, and only the fixed place
 * is sent. Cloudflare keeps Open-Meteo's answer for half an hour, the browser keeps ours for a quarter.
 * Any failure answers null, and the drawing keeps its clear sky. Locally and on other hosts there is no
 * function, the request fails, and the drawing shows the time of day only. */
export async function onRequestGet(): Promise<Response> {
  try {
    const init = { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 1800, cacheEverything: true } };
    const r = await fetch(WEATHER_URL, init as RequestInit);
    if (!r.ok) throw new Error(String(r.status));
    return answer(parseWeather(await r.json()), 'public, max-age=900');
  } catch {
    return answer(null, 'no-store');
  }
}

function answer(vejr: string | null, cache: string): Response {
  return new Response(JSON.stringify({ vejr }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Robots-Tag': 'noindex' } });
}
