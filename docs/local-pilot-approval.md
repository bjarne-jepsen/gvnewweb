# Godkendelse af lokal Google-pilot

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
