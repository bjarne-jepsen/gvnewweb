import { afterEach, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { DAYLIGHTS, SKY, WEATHERS, WEATHER_URL, darkSky, daylightAt, parseWeather, sunAltitude, weatherFor } from '../lib/site/sky';
import { onRequestGet } from '../functions/api/vejr';

const tokens = Object.fromEntries([...(await readFile('src/styles/tokens.css', 'utf8')).matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1]!, m[2]!]));
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

test('solhøjde: midsommer ved middag, midvinter ved midnat', () => {
  // 90° − 55,69° + 23,44° ≈ 57,75° when the sun is due south at midsummer.
  expect(sunAltitude(new Date('2026-06-21T11:10:00Z'))).toBeCloseTo(57.7, 0);
  expect(sunAltitude(new Date('2026-12-21T23:00:00Z'))).toBeLessThan(-50);
});

test('tid på døgnet følger solen, ikke klokken', () => {
  // 13 November: sunset in Copenhagen about 16:05, dark by 16:50 (local time, UTC+1).
  expect(daylightAt(new Date('2026-11-13T11:00:00Z'))).toBe('dag');
  expect(daylightAt(new Date('2026-11-13T15:10:00Z'))).toBe('skumring');
  expect(daylightAt(new Date('2026-11-13T17:00:00Z'))).toBe('nat');
  // 21 June at 22:00 local time it is still dusk, not night.
  expect(daylightAt(new Date('2026-06-21T20:00:00Z'))).toBe('skumring');
});

test('vejrkoder bliver til fem tilstande', () => {
  expect([0, 1, 2, 3, 45, 48, 51, 61, 80, 95, 71, 85].map(weatherFor)).toEqual(['klart', 'klart', 'klart', 'skyet', 'taage', 'taage', 'regn', 'regn', 'regn', 'regn', 'sne', 'sne']);
  expect(parseWeather({ current: { weather_code: 63 } })).toBe('regn');
  for (const bad of [null, {}, { current: {} }, { current: { weather_code: '3' } }, { current: { weather_code: 3.5 } }, { current: { weather_code: 120 } }]) expect(parseWeather(bad)).toBeNull();
});

test('kun det faste sted sendes til Open-Meteo', () => {
  expect(WEATHER_URL).toBe('https://api.open-meteo.com/v1/forecast?latitude=55.69&longitude=12.5&current=weather_code&timezone=Europe%2FCopenhagen');
});

test.each(DAYLIGHTS.flatMap(d => WEATHERS.map(w => [d, w] as const)))('himlen %s / %s: teksten har mindst 4,5:1 i begge ender', (d, w) => {
  const text = tokens[darkSky(d) ? 'color-on-dark' : 'color-ink']!;
  for (const colour of [SKY[d][w].top, SKY[d][w].bottom]) expect(contrast(text, colour)).toBeGreaterThanOrEqual(4.5);
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const answer = async (r: Response) => ({ body: await r.json(), cache: r.headers.get('Cache-Control') });

test('/api/vejr: svarer med vejret og lader browseren gemme det et kvarter', async () => {
  let asked = '';
  globalThis.fetch = (async (url: string) => { asked = url; return Response.json({ current: { weather_code: 73 } }); }) as unknown as typeof fetch;
  expect(await answer(await onRequestGet())).toEqual({ body: { vejr: 'sne' }, cache: 'public, max-age=900' });
  expect(asked).toBe(WEATHER_URL);
});

test('/api/vejr: fejl og mærkelige svar giver intet vejr og gemmes ikke', async () => {
  globalThis.fetch = (async () => new Response('nej', { status: 503 })) as unknown as typeof fetch;
  expect(await answer(await onRequestGet())).toEqual({ body: { vejr: null }, cache: 'no-store' });
  globalThis.fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  expect(await answer(await onRequestGet())).toEqual({ body: { vejr: null }, cache: 'no-store' });
  globalThis.fetch = (async () => Response.json({ hourly: {} })) as unknown as typeof fetch;
  expect((await answer(await onRequestGet())).body).toEqual({ vejr: null });
});
