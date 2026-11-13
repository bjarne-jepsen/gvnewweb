/** The sky over the front page drawing: the time of day from the sun's height over Grøndalsvænge, and the
 * weather from Open-Meteo. Both only change the sky; the houses stay the same (docs/cvi.md, "Forsidetegning"). */

/** Grøndalsvænge, rounded to two decimals (about 1 km). The same point for every visitor. */
export const PLACE = { latitude: 55.69, longitude: 12.5 } as const;

export type Daylight = 'dag' | 'skumring' | 'nat';
export type Weather = 'klart' | 'skyet' | 'regn' | 'sne' | 'taage';
export const DAYLIGHTS: readonly Daylight[] = ['dag', 'skumring', 'nat'];
export const WEATHERS: readonly Weather[] = ['klart', 'skyet', 'regn', 'sne', 'taage'];

const rad = Math.PI / 180;

/** The sun's height over the horizon in degrees at a moment, by the usual low-precision formula
 * (good to well under a degree, which is all a sky colour needs). */
export function sunAltitude(at: Date, latitude: number = PLACE.latitude, longitude: number = PLACE.longitude): number {
  const d = at.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(e) * Math.sin(l));
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15 * rad;
  const h = gmst + longitude * rad - ra;
  const lat = latitude * rad;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h)) / rad;
}

/** Day while the sun is more than 6° up, night when it is more than 6° down (civil twilight), dusk or dawn between. */
export function daylightAt(at: Date): Daylight {
  const altitude = sunAltitude(at);
  return altitude >= 6 ? 'dag' : altitude <= -6 ? 'nat' : 'skumring';
}

/** WMO weather codes, as Open-Meteo gives them, in five states. Light cloud counts as clear. */
export function weatherFor(code: number): Weather {
  if (code === 45 || code === 48) return 'taage';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sne';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'regn';
  if (code === 3) return 'skyet';
  return 'klart';
}

/** The current weather from Open-Meteo's answer, or null when the answer is not what we expect. */
export function parseWeather(v: unknown): Weather | null {
  const code = (v as { current?: { weather_code?: unknown } } | null)?.current?.weather_code;
  return typeof code === 'number' && Number.isInteger(code) && code >= 0 && code < 100 ? weatherFor(code) : null;
}

export const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.latitude}&longitude=${PLACE.longitude}&current=weather_code&timezone=Europe%2FCopenhagen`;
export const WEATHER_SOURCE = 'Open-Meteo.com';

/** Words for the note under the drawing. */
export const weatherWords: Record<Weather, string> = { klart: 'klart vejr', skyet: 'overskyet', regn: 'regn', sne: 'sne', taage: 'tåge' };

/** Sky colours, top and bottom of the gradient, for each time of day and weather. Text over the sky is ink
 * by day and at dusk and light at night; tests/sky.test.ts checks every pair for at least 4.5:1. */
export type SkyColours = { top: string; bottom: string };
export const SKY: Record<Daylight, Record<Weather, SkyColours>> = {
  dag: {
    klart: { top: '#A9C9DD', bottom: '#E4EEF0' },
    skyet: { top: '#B7C1C6', bottom: '#DDE2E3' },
    regn: { top: '#9DACB4', bottom: '#C6CED2' },
    sne: { top: '#C9D2D6', bottom: '#EBEEEF' },
    taage: { top: '#CBD2D1', bottom: '#E6EAE8' },
  },
  skumring: {
    klart: { top: '#8FA4BF', bottom: '#F1C996' },
    skyet: { top: '#99A2AF', bottom: '#D9C4B1' },
    regn: { top: '#8B97A4', bottom: '#C4B6AA' },
    sne: { top: '#A9B1BC', bottom: '#DDD3CB' },
    taage: { top: '#A7AEB4', bottom: '#D9D1C8' },
  },
  nat: {
    klart: { top: '#0F1A2E', bottom: '#24365A' },
    skyet: { top: '#1C2535', bottom: '#384356' },
    regn: { top: '#18212F', bottom: '#333E50' },
    sne: { top: '#232C3B', bottom: '#465063' },
    taage: { top: '#242C38', bottom: '#454D5A' },
  },
};
/** Light text on the night sky, ink otherwise. */
export const darkSky = (d: Daylight) => d === 'nat';
