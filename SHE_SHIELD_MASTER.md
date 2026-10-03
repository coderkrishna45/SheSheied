# SheShield — current project context

This document describes the implemented v2 architecture. The earlier prototype and its three workflows are superseded. See [README.md](README.md) for setup and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the original audit.

## Product and constraints

Android women’s journey safety companion; Kolkata walking demo; native UI with light/dark rounded cards, route previews and safety check-ins. User has Android Studio on Windows and runs this source workspace in WSL Arch. n8n runs at `alluvia.app.n8n.cloud` on the user's Cloud trial. It must not be replaced with a self-hosted n8n instance.

The user authorized full implementation after reviewing the plan. The work is driven by feature dependencies, not a day-one/day-two schedule. Existing contacts/history must be preserved. Never print service secrets, commit local configuration, invent successful provider results, or silently switch a failed live action into a rehearsal.

## Runtime architecture

- Android: Kotlin/Fragments, programmatically composed native Views, Navigation, Room v2, Retrofit, MapLibre 10.2.0 (this SDK version uses `com.mapbox` packages), Fused Location and a LifecycleService.
- API: Node 24.21.0, Fastify 5, built-in SQLite with WAL and transactions. `api/src/app.js` owns sessions, plans, trips, check-ins, SOS incidents, attempts and expiring share tokens. JavaScript ESM avoids a separate transpilation step for the local demo API.
- Risk: `n8n/risk_engine.js` is the one production scoring implementation. API and rehearsal generation import it. Android only evaluates fix quality and proximity/progress against its returned segments.
- n8n Cloud: workflow `04_cloud_delivery_v2.json` receives authenticated delivery jobs, claims each attempt from the API, calls Twilio and records its result. No workflow static data is used for trip state.
- Provider callbacks: API verifies Twilio signatures using the exact public HTTPS URL. Call acknowledgement is a separate callback triggered by pressing 1.
- Practice: editable planning always requests real ORS directions for the selected endpoints, including in `REHEARSAL` mode. Android simulates positions and contact outcomes. Changing either endpoint invalidates the previous plan.
- Recorded demo: a separate explicit action loads `demo/kolkata_scenario.json` with recorded ORS walking geometry and fictional incidents. `scripts/build_rehearsal.mjs` bundles a production-scored plan in the APK, usable offline. API callers must explicitly request `recorded_scenario: true` in `REHEARSAL` mode to load this fixed scenario.

## Important source locations

| Concern | Source |
| --- | --- |
| API state, worker and endpoints | `api/src/app.js`, `store.js`, `providers.js` |
| API secrets/configuration | ignored `api/.env`; template `.env.example` |
| Production geographic exposure | `n8n/risk_engine.js` |
| Room schema/migration/outbox | Android `data/model/` |
| Local commands and sync | `data/repository/TripRepository.kt`, `service/SyncWorker.kt` |
| GPS/replay/deadlines | `service/TripTrackingService.kt` |
| Notifications/device texting | `util/NotificationHelper.kt`, `SmsHelper.kt` |
| Map/visual components | `ui/components/` |
| Screens | `ui/screens/`, `ui/MainActivity.kt` |
| Cloud delivery | `n8n/workflows/04_cloud_delivery_v2.json` |
| Setup/demo/incident import | `README.md`, `docs/`, `scripts/` |

## State and reliability rules

`ACTIVE → CHECK_IN_PENDING → ACTIVE` on timely SAFE; expiry or manual SOS leads to `SOS_ACTIVE`. An SOS can exist without a trip. End/cancel persists locally before network synchronization and stops monitoring. An installation can have only one active trip. Every API mutation command requires a stable idempotency key, and owner checks prevent another installation from reading its data.

Room stores selected geometry, mode, immutable endpoints, route revision, check-in deadline and ID, SOS reference, progress, history and outbox. The 1→2 migration preserves legacy rows without destructive fallback. Legacy rows lacking geometry show a restoration warning; do not fabricate geometry for them. Old contacts remain in their existing preferences.

The service evaluates two accurate consecutive fixes on elevated segments, uses a 60-second check-in cooldown, detects repeated deviation, and suggests arrival after a 40 m / 15-second dwell. Client deadlines persist as absolute timestamps. The API independently expires registered live deadlines. WorkManager retries ordered offline mutations with stable keys. Unsent SOS expires after five minutes and produces a visible synchronization warning.

Standalone SOS waits at most two seconds for optional location. Device SMS and queued remote calls operate independently. Journey recipients use the snapshot taken at trip start. A canceled in-flight SOS is compensated with a cancel command when its server result arrives. Device SMS statuses follow the local incident ID even after a remote ID is assigned.

Attempt states distinguish QUEUED, DISPATCHING, REQUESTED, REQUEST_UNKNOWN, RINGING, IN_PROGRESS, FAILED, NO_ANSWER, BUSY, COMPLETED_UNCONFIRMED, ACKNOWLEDGED, CANCELLED and UNAVAILABLE. Duplicate claims and terminal callbacks do not create repeated calls. A valid late acknowledgement can stop the next queued attempt. Unknown provider outcomes are not automatically retried.

## Evidence and mode separation

ORS walking directions have been verified for four distinct Kolkata endpoint pairs. Both practice and live custom plans use the chosen coordinates; they never fall back to recorded geometry. The provider's walking-path snapping is reported, requested map pins remain visible, and endpoints over 200 m from the returned path are rejected. Missing incident data yields UNKNOWN, not LOW. The API requires real, dated records and explicit valid coverage. No actual Pinecone dataset has yet been verified. Only the recorded demo displays fictional evidence. Low exposure is an uncalibrated comparative index, not a probability or safety guarantee. Do not invent lighting, crowd or police-presence claims.

The v2 UI uses deterministic evidence explanations. Generative AI, new travel modes, safe-place discovery and social features are optional extensions outside the validated core. Expiring read-only sharing is implemented, with a schematic route preview and last recorded location.

## Operational notes

API port is **8787**, not the old n8n port 5678. Release Android builds forbid cleartext; debug builds permit local HTTP. ORS and Twilio keys are kept out of BuildConfig, HTTP body logs and new workflow JSON. The historical `SheShield.json` remains a reference and contains exposed historical credentials; rotate anything shared with that file, without repeating its values in documentation.

The configured portable WSL tools live in `/tmp/sheshield-tools/`. The build helper stages Android under `/tmp` to avoid rewriting Windows Studio's SDK path. `/tmp` tools are session conveniences, not permanent system installations.

Read [docs/VALIDATION.md](docs/VALIDATION.md) for observed checks and limitations. An APK build, successful local tests or a configured-key indicator does not prove real carrier delivery or an activated n8n workflow. Keep those claims separate.
