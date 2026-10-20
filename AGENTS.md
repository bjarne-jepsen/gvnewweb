# Codex-arbejdsinstruktioner — gvnewweb

Du arbejder på Grøndalsvænge 2.0, et Astro-baseret statisk website for en andelsboligforening.

1. Læs `docs/architecture-v1.md` og `docs/implementation-plan.md` i sin helhed.
2. Begynd med **discovery**, ikke implementering: gennemgå datakontrakter, versionsbundet godkendelse, statiske assets og publiceringssikkerhed. Identificér kun væsentlige problemer.
3. Foreslå en enkel teknisk plan og opdel den i små, testbare leverancer. **Stop og afvent eksplicit godkendelse, før du skriver applikationskode.**
4. POC starter med mockdata i det samme normaliserede format som kommende Google Workspace-adaptere. Mockadapter og fremtidig Google-adapter skal opfylde den samme validerede kontrakt.
5. Må ikke ændre publiceret indhold ud fra seneste candidate; kun godkendt `id + contentHash` og uforanderligt snapshot kan offentliggøres. Test denne invariant.
6. Default deny: ingen private, board-only, ukendte eller ikke-godkendte objekter/assets i `dist`, sitemap eller søgeindeks.
7. Ingen database, login, Google API, CMS eller produktionsdeploy i POC. Undgå unødvendige afhængigheder.
8. Anvend Astro + TypeScript, Zod til runtime-validering og Bun som runtime/package manager hvor hensigtsmæssigt. Foretræk simpel arkitektur.
9. Før enhver implementeringsfase: angiv mål, filer der ændres, testkriterier og risici. Efter fasen: testresultater og eventuelle afvigelser.
10. Stil kun spørgsmål, hvis svaret reelt ændrer arkitektur eller korrekthed. Ellers dokumentér antagelser.