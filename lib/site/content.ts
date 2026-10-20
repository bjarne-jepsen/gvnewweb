import { readFile } from 'node:fs/promises';
import type { PublicRecord } from '../publication/store';

export const records: PublicRecord[] = JSON.parse(await readFile('.build/content.json', 'utf8'));
export const sections = { document: 'dokumenter', guide: 'vejledninger', notice: 'opslag', event: 'kalender' } as const;
export const labels = { document: 'Dokumenter', guide: 'Vejledninger', notice: 'Opslag', event: 'Kalender' } as const;
export const url = (r: PublicRecord) => `/${sections[r.type]}/${r.slug}/`;
export const download = (r: Extract<PublicRecord, {type: 'document'}>) => `/downloads/${r.file.assetHash.slice(7)}.pdf`;
export const date = (value: string) => new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
export const time = (value: string) => new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' }).format(new Date(value));
