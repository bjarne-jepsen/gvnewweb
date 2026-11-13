import { expect, test } from 'bun:test';
import { sentences, teaser } from '../lib/site/teaser';

test('kort tekst vises hel', () => {
  expect(teaser('Vandet lukkes tirsdag.')).toBe('Vandet lukkes tirsdag.');
  expect(teaser('  To   mellemrum\nog linjeskift. ')).toBe('To mellemrum og linjeskift.');
});

test('lang tekst beholder hele sætninger, så mange der er plads til, uden prikker', () => {
  const text = 'Legepladsen har fået to nye beboere. En ræv og en snegl, som de mindste allerede kan klatre på og lege med. Sneglen har fået et par overfladiske ridser under opsætningen, men de bliver udbedret snarest.';
  expect(teaser(text)).toBe('Legepladsen har fået to nye beboere. En ræv og en snegl, som de mindste allerede kan klatre på og lege med.');
});

test('punktum efter tal, forkortelser og initialer afslutter ikke en sætning', () => {
  expect(sentences('Ovne fra før 1. juni 2008 skal sløjfes. Det gælder fx. også H. C. Ørsteds vej, dvs. Nr. 3. Slut.'))
    .toEqual(['Ovne fra før 1. juni 2008 skal sløjfes.', 'Det gælder fx. også H. C. Ørsteds vej, dvs. Nr. 3.', 'Slut.']);
  const text = 'Vi minder om, at brændeovne skal sløjfes, hvis de er installeret før 1. juni 2008. Ifølge de nyere miljøkrav skal disse ældre ovne enten udskiftes til en ny og mere miljøvenlig model eller sløjfes. (dvs. fjernes eller gøres ubrugelige).';
  expect(teaser(text)).toBe('Vi minder om, at brændeovne skal sløjfes, hvis de er installeret før 1. juni 2008.');
});

test('for lang første sætning skæres ved et ord med " …" og aldrig midt i et ord', () => {
  const text = 'Bestyrelsen har på det seneste møde besluttet at hækkene langs fællesvejene fremover skal klippes to gange om året af et eksternt firma som vælges efter indhentning af tilbud og at udgiften deles mellem alle andelshavere.';
  const t = teaser(text);
  expect(t.endsWith(' …')).toBe(true);
  expect(t.length).toBeLessThanOrEqual(160);
  const kept = t.slice(0, -2);
  expect(text.startsWith(kept)).toBe(true);
  expect(text[kept.length]).toBe(' '); // the cut falls between two words
  expect(kept).not.toMatch(/\b(og|at|af|som|et)$/); // no dangling connecting word
});

test('hvis de hele sætninger bliver for korte, skæres ved et ord i stedet', () => {
  const text = `Husk det. ${'Resten af teksten er en lang sætning uden punktum der fortsætter og fortsætter '.repeat(3)}`;
  const t = teaser(text);
  expect(t.startsWith('Husk det. Resten')).toBe(true);
  expect(t.endsWith(' …')).toBe(true);
});

test('skæring fjerner tegn foran prikkerne', () => {
  const text = `${'ord '.repeat(38)}langtord, ${'mere '.repeat(10)}`;
  expect(teaser(text)).not.toMatch(/[,.;:] …$/);
});
