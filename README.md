# Grøndalsvænge 2.0

Statisk website (Astro + TypeScript) for Andelsboligforeningen Grøndalsvænge.

## Status

**Discovery og planlægning.** Den første tekniske implementering skal anvende lokale mockdata med præcis samme normaliserede kontrakt, som en senere Google Workspace-adapter skal levere.

Læs `docs/architecture-v1.md`, `docs/implementation-plan.md` og `AGENTS.md` før udvikling.

## Principper

- Ingen afhængighed mellem frontend og Google Workspace.
- Fire content-typer: document, guide, notice, event.
- Godkendelse er knyttet til `id + contentHash` og en fastfrosset indholdsversion.
- Kun offentligt, godkendt indhold må ende i statiske outputfiler.
- Ingen database, login, Google API-integration eller produktionsdeploy i første POC.
- Fasevis implementering med tests og en tydelig godkendelsesgrænse efter planen.