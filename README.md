# Waymate · Street evidence and Walk with me

A native Android journey companion focused on Kolkata: compare real walking routes, understand available incident evidence, monitor a journey, and request help from a trusted circle.

**Start here:** open `android/` in Android Studio. The current debug APK is `artifacts/Waymate-debug.apk`. Custom routes use OpenRouteService in both practice and live modes. The explicit recorded Kolkata demo works without the API; map tiles still need internet unless already cached. Contact calls use your existing n8n Cloud account.

## Practicality update

- **Street evidence & gaps:** Salt Lake routes use sections up to 10 m and distinguish reviewed street matches, wider-area reports, historical events, source links and reporting gaps. Names and reviewed geometry must agree; nearby roads do not inherit reports. Live safety remains unknown.
- **Reviewed data admission:** dated source and reuse registry, event/publisher IDs, date intervals, public-space setting, uncertainty and two real location reviews are required for street admission. Immutable hashed snapshots and an independent-reference evaluator expose actual counts and unmeasured accuracy.
- **Walk with me:** set a personal check-in even when no crime evidence exists. The app distinguishes a local timer from a deadline confirmed by the server and reports whether automatic contact calls are configured.
- **Find another way:** during a live journey, preview alternatives from fresh GPS, optionally avoiding an area 100 m or 250 m ahead. Accept a replacement while keeping the destination, contacts and pending check-in deadline. Earlier avoidances remain for this journey. If no distinct path exists, the current route stays active.
- **Cloud calls and SMS:** the n8n Cloud worker supports sequential contact calls and separate SMS delivery with signed provider callbacks. The SOS screen shows both channels; delivered SMS does not mean a person acknowledged. Live services stay disabled until configured for consenting recipients.
- **Companion acknowledgement:** a private browser link lets someone acknowledge the current watch without installing the app. They cannot cancel the traveller's check-in. Links can be revoked and stop sharing when the journey ends.

**The Salt Lake pilot contains five real published references and zero independently validated street incidents or current observations.** They appear as wider-area context, with two historical reports. Complete street reporting remains unavailable. Read [the data rules](docs/INCIDENT_DATA.md), [source decisions](evidence/saltlake/SOURCE_RESEARCH.md), [prepared partner requests](docs/PARTNER_REQUESTS.md) and [the product rationale](docs/PRACTICALITY.md). Calculation resolution does not establish location accuracy. No personal field survey is required from the user.

## Visual design

The app now uses a shared light/dark design across journey planning, route cards, safety check-ins, contact updates, settings, dialogs and the companion page. See [design notes and previews](docs/DESIGN.md).

## What changed

- Light and dark native screens with rounded cards, spacious typography, three-tab navigation, route selection, journey monitoring, a circle editor, history, settings, onboarding, and SOS updates.
- Real ORS `foot-walking/geojson` geometry, alternatives, distances and turn instructions. Route failures are visible; the app never substitutes a straight line or invents a successful trip.
- Search and select both endpoints, use GPS for the start, or long-press the map to place pins. Changing either endpoint invalidates the previous plan. Requested pins remain visible when the provider snaps to nearby walking paths; access distances over 30 m are explained, and snapping over 200 m is rejected.
- Landmark search is bounded to Greater Kolkata. ORS results must match the requested place terms; missing landmarks use bounded Nominatim search rather than unrelated museums or other cities. [Pelias search boundaries](https://github.com/pelias/documentation/blob/master/search.md), [Nominatim bounded search](https://nominatim.org/release-docs/latest/api/Search/).
- Immutable selected endpoints and geometry stored locally. The map draws persistent layers, distinguishes alternatives/elevated segments, follows only when requested, and allows recentering.
- A location foreground service supports personal watch deadlines with server registration. Elevated-segment triggers are confined to the explicitly fictional recorded rehearsal; live unknown streets never trigger an inferred crime-risk alert.
- Local SQLite/Room persistence, stable command IDs, an offline outbox, background sync, standalone SOS, ordered contacts, signed provider callbacks and explicit delivery states.
- A recorded Kolkata walking rehearsal using production scoring and clearly fictional incident evidence. It never sends real calls or messages.

## Run the local API

Use Node **24.21.0 or newer in the Node 24 line**; the API uses built-in SQLite. On this WSL workspace a portable runtime is available at `.tools/runtime/node/bin/node`; `.tools/` is ignored by Git.

```bash
python3 scripts/configure_local.py
cd api
npm ci
npm start
```

Alternatively, in this configured workspace: `scripts/run_api.sh`. Dependencies are already installed. The API listens on port **8787**. The default database is `api/data/sheshield.sqlite`; keep it to preserve sessions and pending alerts. Service keys belong in ignored `api/.env`. The configuration helper can copy an ORS key from ignored `android/local.properties`; the Android build does not read that key.

`GET /health` checks the process. `GET /ready` reports configuration presence; it does **not** certify a provider credential or deployed workflow. `node --env-file=api/.env scripts/verify_live.mjs` from the repository root checks actual Kolkata place search and walking routes without requesting alerts.

Docker is also supported:

```bash
docker compose up --build api
```

This runs the API only. n8n remains in the Cloud. The data volume maps `api/data` to `/data`; the container overrides `DATABASE_PATH` to `/data/sheshield.sqlite`.

## Connect Android

Open `android/` in Android Studio (`C:\Program Files\Android\Android Studio`). Let Studio manage `sdk.dir` in `local.properties`.

- Emulator API URL: `http://10.0.2.2:8787` when the API is reachable on the Windows host.
- Physical phone: use the API's public HTTPS tunnel URL, or your laptop's reachable LAN address for debug builds.
- Enter the API URL and the `ENROLLMENT_CODE` from `api/.env` under Settings → Service connection. Read the code locally; do not paste it into chat or commit it.
- End a journey before changing its API connection or mode.
- Location access is required to run the location foreground service. Rehearsal uses simulated positions. Notifications make background check-ins visible. Android force-stop stops local monitoring until you reopen the app; the server can still expire an already registered live deadline.
- Device SMS is optional, needs an SMS-capable SIM and permission, and reports separate request/sent/delivered states. The emulator cannot verify actual carrier delivery.

If both place search and route planning say **Connection unavailable**, check the API connection even if the phone has internet. `10.0.2.2` is an emulator address. A physical phone needs the current public HTTPS URL, and both the API and tunnel must stay running. Open `YOUR-API-URL/health` in the phone browser; it should return `status: ok`. After replacing a temporary tunnel URL, enter the enrollment code again before tapping **Save connection**. **Check readiness** checks configuration; the command below also verifies enrollment, actual place search and a short walking route without starting a journey or requesting alerts:

```bash
.tools/runtime/node/bin/node --env-file=api/.env scripts/verify_connection.mjs
```

The launcher scripts use the persistent Node installation in `.tools/runtime/node` and tunnel executable in `.tools/cloudflared` when system installations are absent.

For the isolated WSL build already configured here:

```bash
scripts/build_android.sh :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The helper builds in ignored `.tools/android/build` so it does not rewrite Studio's Windows SDK path, then copies the APK to `artifacts/`. Portable SDK, JDK and Gradle cache also live under `.tools/android`. With a regular Linux SDK/JDK, set `SHESHIELD_SDK` and `JAVA_HOME` to your installations. On Windows use Studio or `android\gradlew.bat`.

## Connect n8n Cloud and Twilio

Follow **[n8n/IMPORT_CHECKLIST.md](n8n/IMPORT_CHECKLIST.md)**. Import workflow **04 only**. Workflows 01–03 are superseded. The API owns journey and delivery state; n8n acts as a delivery worker.

Start a public HTTPS tunnel while the API is running:

```bash
scripts/run_tunnel.sh
python3 scripts/configure_local.py --public-url https://YOUR-TUNNEL.trycloudflare.com
```

Restart the API after changing `.env`. Set the same URL in the workflow Configuration node. Quick tunnels are temporary and their URL changes on restart; use a stable named tunnel/deployment for a lasting installation. [Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Configure the Twilio credentials in n8n, the matching `TWILIO_AUTH_TOKEN` locally for signature validation, and the shared Header Auth credential. `LIVE_ALERTS_ENABLED=false` is the default. To test real calls, add consenting recipients to `TEST_RECIPIENT_ALLOWLIST`, then enable live alerts and restart the API. Twilio trial accounts may require verified recipients.

Cloud SMS additionally requires the updated worker's SMS branch, its Twilio/Header Auth credential bindings, an SMS-capable sender and `LIVE_SMS_ENABLED=true`. Existing n8n Cloud credentials can be reused. `N8N_API_KEY` is optional management access for inspecting/configuring the cloud workspace; it is not the phone's enrollment code or the delivery worker token.

A ringing or completed call does not imply acknowledgement. The recipient presses **1** to acknowledge. Duplicate jobs cannot claim the same attempt. Uncertain provider requests are not blindly repeated. Cancellation stops future escalation; it cannot recall a call or message already sent.

## Incident data and exposure

Salt Lake uses the reviewed version 4 snapshot installed through `INCIDENT_DATA_PATH`. Five real news references retain their source/date/location limits and appear as area context. No street records, current conditions or complete reporting feeds have been acquired, so live safety remains **UNKNOWN** and the tested pilot routes still sort by walking time.

The new OSM walking snapshot adds named-area outlines, lighting/walkway facts and nearby mapped places. BG Block has one historical report association; it is not a current danger zone. Missing lighting, pedestrian activity, opening hours and entrance connections remain unknown. Condition preferences appear only when enough comparable information exists. Optional departure check-ins use sustained, accurate GPS and the existing registered alert timer. See **[docs/WALKING_CONDITIONS.md](docs/WALKING_CONDITIONS.md)** for sources, thresholds, operation and limitations.

Read **[docs/INCIDENT_DATA.md](docs/INCIDENT_DATA.md)** for source research, admission, review, accuracy evaluation and publication. A 10 m calculation grid and Pinecone similarity cannot establish accurate incident geography. Dated conditions need actual provider observations and expire automatically. Accuracy is unmeasured until an independent reference sample exists.

## Demonstrate the product

1. Open Plan your journey, then select **“Open the recorded Kolkata demo”**. This explicitly loads the fixed Esplanade → Victoria Memorial scenario.
2. Compare the three recorded walking routes and open “Why this route?” to inspect the fictional evidence and the time tradeoff.
3. Start the journey and use recenter/pan to see the simulated position.
4. “Next check-in” advances to an elevated segment. Press “I'm safe” to continue.
5. Advance to another check-in and background the app. After twenty seconds, open the SOS notification to see the simulated first contact unanswered and the second acknowledged.
6. Cancel future escalation, end the journey, then view Activity. Standalone SOS is also available on the home screen.

The recorded demo has no dependency on API availability or live incident credentials. For custom journeys, choose **From** and **To** and press **Find walking routes**: practice mode calculates real routes while simulating positions and alerts; live mode uses device GPS and configured delivery services. Basemap tiles are network dependent and are not bulk downloaded.

## Verification

```bash
cd api
npm test
```

Android checks: `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug`. Device migration test: `:app:assembleDebugAndroidTest`, then run `DatabaseRecoveryTest` using Android Studio or ADB instrumentation. Tests use a separate temporary database and preserve the app's real contacts/history.

See **[docs/VALIDATION.md](docs/VALIDATION.md)** for the 94-test API suite, browser checks, emulator observations, screenshots and external setup still requiring verification. The source plan is [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); current architecture is [SHE_SHIELD_MASTER.md](SHE_SHIELD_MASTER.md).
