# Godkendelse af lokal Google-pilot

> **Historisk.** Dette dokument beskriver den tidligere model med versionsgodkendelse og snapshots. Den er erstattet af mappemodellen (`docs/mappemodel-fase0.md` til `docs/mappemodel-fase2d.md`) og fjernet fra koden i fase 2d (21. oktober 2026).

Brugeren godkendte de to gennemsete snapshots med beskeden:

> Jeg godkender de to viste snapshots til den lokale pilot.

Godkendelsen blev registreret 20. oktober 2026 kl. 17:25:28 Europe/Copenhagen (15:25:28 UTC), med godkender `bjarne.jepsen`.

| Indhold | Godkendt contentHash |
|---|---|
| doc-google-pilot | sha256:8d8a4fc075029e375a7b589c4e5080b143e32a7c34253a38e729faa152e48a90 |
| guide-google-pilot | sha256:7e4d525d00eb0a0d803150a5060ddb5ccb58f4f02166eef1062605ddf82f23e2 |

Kilden er den tidligere gennemsete, lokale prepared-mappe `prepared-cQRiKU`. Snapshot-records, PDF og billede er integritetskontrolleret og kopieret fra denne mappe. Ingen nyere Google-version er hentet eller brugt.

Godkendelsen omfatter kun lokal pilot og lokal versionsstyring. Den omfatter ikke upload til Simply.com, deling af repository eller anden ekstern offentliggørelse. Release-manifestets `publish` betyder her udvælgelse til lokal statisk build. En senere ekstern release kræver særskilt godkendelse af indhold og destination.

De to kandidater er tilføjet til de eksisterende normaliserede JSON-filer. Begge eksakte versioner er registreret i godkendelsesregistret og release-manifestet. Eksisterende snapshots og godkendelser er bevaret. PDF og billedfil findes som versionsbundne snapshotkopier; rå API-svar og midlertidige Google-URL'er er fortsat uden for Git og statisk output.

Verifikation efter registrering: 43 tests består; Astro/TypeScript har 0 fejl, 0 advarsler og 0 hints. Den lokale statiske build består outputkontrollen og omfatter 17 sider fra 12 valgte snapshots samt to PDF-filer og ét billede.

## Anden version: XXX-ændringen

Brugeren godkendte derefter den nye, gennemsete vejledningsversion med beskeden:

> Jeg godkender den nye version med XXX til den lokale pilot

Registreret 20. oktober 2026 kl. 17:44:25 Europe/Copenhagen (15:44:25 UTC).

- ID: `guide-google-pilot`
- Ny hash: `sha256:4ab5312f9b873c52aee7e11c2eb7280dd277d1b5842dbf229142bdf1609602be`
- Tidligere hash: `sha256:7e4d525d00eb0a0d803150a5060ddb5ccb58f4f02166eef1062605ddf82f23e2`
- Prepared-kilde: `prepared-8HCrMM`, allerede gennemset på port 4324.
- Godkender: `bjarne.jepsen`.

Manifestet udpeger nu den nye vejledning med teksten `XXXFælleslokalerne: Hvem skal betale?`. Den tidligere snapshotmappe og godkendelse er bevaret. PDF-versionen og billedets bytes er uændrede. Der er ikke hentet en nyere Google-version under godkendelsen.

Ændringen er fortsat kun godkendt til lokal pilot og lokal Git. Ingen upload, push eller ekstern offentliggørelse er autoriseret eller udført.

Inden denne godkendelse blev det afprøvet, at den ændrede kandidat gav 23 identiske outputfiler uden ny godkendelse. Den nye godkendelse afslutter dermed den afprøvede kæde: kildeændring → ny kandidat → uændret lokal hjemmeside → eksplicit versionsgodkendelse → lokal opdatering.

Verifikation efter den nye godkendelse: 43 tests består, typekontrol har 0 fejl/advarsler/hints, og statisk build består outputkontrollen. Localhost på port 4321 viser hele det nye godkendte indhold med XXX og otte tabeller; PDF og billede er kontrolleret mod deres godkendte filhashes.
