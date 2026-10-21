# Codex-arbejdsinstruktioner — gvnewweb

Du arbejder på Grøndalsvænge 2.0, et Astro-baseret statisk website for en andelsboligforening.

1. Læs `README.md` og `docs/mappemodel-fase0.md` til `docs/mappemodel-fase2d.md` i sin helhed. De ældre dokumenter i `docs/` er historiske.
2. Begynd med **discovery**, ikke implementering: gennemgå datakontrakter, mappemodellen, statiske assets og publiceringssikkerhed. Identificér kun væsentlige problemer.
3. Foreslå en enkel teknisk plan og opdel den i små, testbare leverancer. **Stop og afvent eksplicit godkendelse, før du skriver applikationskode.**
4. Indhold synkroniseres fra Drive til `content/` i Git. Den rigtige Drive-klient og testens `FakeDrive` opfylder samme `DriveSource`-interface og samme Zod-validering.
5. En fil er offentlig, hvis og kun hvis den eller en genvej til den ligger direkte i en konfigureret sektionsmappe. Ikke-accepterede forslag må aldrig publiceres. Test begge dele.
6. Default deny: ukendte filtyper, undermapper, fejl og ulæselige filer publiceres ikke og rapporteres. En ufuldstændig listning må aldrig fjerne indhold.
7. Ingen database, login, CMS eller produktionsdeploy. Kun læseadgang til Google. Ingen push, upload eller Drive-ændringer uden udtrykkelig godkendelse.
8. Anvend Astro + TypeScript, Zod til runtime-validering og Bun som runtime/package manager hvor hensigtsmæssigt. Foretræk simpel arkitektur.
9. Før enhver implementeringsfase: angiv mål, filer der ændres, testkriterier og risici. Efter fasen: testresultater og eventuelle afvigelser.
10. Stil kun spørgsmål, hvis svaret reelt ændrer arkitektur eller korrekthed. Ellers dokumentér antagelser.
