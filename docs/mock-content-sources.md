# Kilder til realistiske mockvejledninger

> **Historisk.** Dette dokument beskriver den tidligere model med versionsgodkendelse og snapshots. Den er erstattet af mappemodellen (`docs/mappemodel-fase0.md` til `docs/mappemodel-fase2d.md`) og fjernet fra koden i fase 2d (21. oktober 2026).

Udvidet 20. oktober 2026 på brugerens ønske om mere realistisk indhold fra Andelshaveren. Der bruges korte bearbejdede tekster, ikke en komplet kopi eller en automatisk import.

| Lokal guide | Offentlig kilde |
|---|---|
| Hvordan sælger jeg mit hus? | https://groendalsvaenge.dk/andelshaveren/hvordan-saelger-jeg-mit-hus/ |
| Ventelister i Grøndalsvænge | https://groendalsvaenge.dk/andelshaveren/ekspektance-og-internliste/ |
| Planlægger du at bygge? | https://groendalsvaenge.dk/andelshaveren/byggeprojekter/ |
| Anmeldelse af forsikringsskader | https://groendalsvaenge.dk/andelshaveren/anmeldelse-af-forsikringsskader/ |
| Renovation og affald | https://groendalsvaenge.dk/andelshaveren/renovation/ |
| Leje af lokaler i foreningsbygningen | https://groendalsvaenge.dk/groendalsvaenge-socialt/leje-af-lokaler-i-groendalsvaenge-fritidsforening/ |

Lokalelejesiden er linket fra Andelshaveren-navigationen, men ligger under Socialt. Hver guide henviser læseren til originalsidens fulde oplysninger. Der er ikke foretaget selvstændig juridisk revision af teksterne eller kontrol af, om alle driftsoplysninger fortsat er gældende. Der opfindes ikke nye regler eller kontaktoplysninger.

Indholdet er klargjort som lokale mockrecords gennem fælles `sealRecord`, med uændret schemaVersion og provider `mock`. Seks nye prepared snapshots er fastholdt og knyttet til lokale simulerede versionsgodkendelser. De eksisterende snapshots bevares. Ingen ændring er foretaget på groendalsvaenge.dk.

`updatedAt` angiver klargøringen af prøveindholdet. Originalens seneste ændringstidspunkt kendes ikke; provenance markerer derfor en kurateret fixture, ikke en liveintegration.

Den fiktive PDF knyttes ikke til de seks vejledninger som om den var et ægte bilag. Forsikringspolice og andre eksterne filer er ikke downloadet. Kalenderen er stadig et tydeligt fiktivt eksempel. Private fixtures og testmarkører bevares til kontrollen af default deny.
