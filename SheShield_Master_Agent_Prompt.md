# Working on SheShield

Read `README.md`, `SHE_SHIELD_MASTER.md`, `docs/VALIDATION.md`, and the original audit in `IMPLEMENTATION_PLAN.md` before changing the app.

The current implementation is v2: native Kotlin Android, a local Node/SQLite API on port 8787, and n8n Cloud workflow 04 as a delivery worker. The old workflow architecture is superseded. Do not revert to cross-workflow static data or self-hosted n8n.

Preserve contacts, journeys and local properties. Never expose keys, log sensitive request bodies, fabricate routes/success states, or send real alerts from rehearsal. Test the production risk engine directly. Keep provider configuration and observed verification distinct. Use dependency-based implementation and focused checks; the user's request superseded the old day-by-day schedule.

Provider credentials are in ignored local files and n8n credentials. Historical `SheShield.json` is reference only and contains exposed historical credentials; do not reproduce them.
