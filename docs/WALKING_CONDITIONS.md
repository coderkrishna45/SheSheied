# Walking conditions and departure check-ins

## What is implemented

The app compares actual walking routes, explains information gaps, shows one map-detail layer at a time, and lets the traveller request an alternative or a walking route via a nearby mapped place. Optional departure monitoring starts an existing server-backed safety check-in after a sustained, accurate GPS departure. Live safety remains **UNKNOWN**.

Open **Map details** for area-report outlines, lighting facts, or at most three nearby place dots. A faint amber area means a report names that area; it is not a red zone or a predicted risk. Tap it for the date/location limits, source and an avoidance request. Unknown lighting uses a thin dashed route; mapped lights and current reviewed observations are labelled separately. **Why this route? → Lighting, walkways & nearby places** exposes source links and gaps without relying on map colour.

During a journey, **Find a mapped place nearby** lists up to eight places within 800 m as measured on the map. This distance is not walking access. Requesting a walking option uses the real walking provider with the place as a waypoint. The user reviews and accepts it; the destination and any pending check-in remain unchanged. A map point is not a confirmed entrance, open business, agreement to assist, or refuge.

## Sources and present coverage

The published [OSM snapshot](../evidence/saltlake/environment/walking.v1.json) was collected on 2 October 2026 through bounded requests to the [OpenStreetMap map API](https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_map_data_by_bounding_box:_GET_/api/0.6/map). The rectangles prioritize Salt Lake Sectors II and V and surrounding extracts. They are collection extents, not official sector boundaries or proof of complete coverage.

The [download manifest](../evidence/saltlake/environment/manifest.json) records raw download hashes, retrieval times and the public snapshot hash. Publication creates immutable version/hash directories. The stripped public dataset removes contributor identities and address tags. OSM attribution and ODbL licensing remain; [OSM copyright and licence](https://www.openstreetmap.org/copyright).

| Fact | Current dataset |
| --- | --- |
| Road/path ways | 9,146 |
| Mapped facilities | 237 raw; 234 after conservative name/location deduplication |
| Surrounding/block polygons | 1,143 |
| Ways with a lighting tag | 114; this is not route coverage |
| Ways with a sidewalk tag | 198; this is not a surveyed sidewalk inventory |
| Facilities with an opening-hours string | 46 |
| Facilities with a confirmed mapped entrance connection to the walking graph | 0 |
| Independent validation / complete Salt Lake coverage | Neither established |

The crime snapshot remains **five real news references, zero admitted street incidents, zero current reviewed condition observations, zero complete reporting feeds**. One historical snatching report explicitly names BG Block. The app links that event to the OSM BG Block polygon ([way 192225283](https://www.openstreetmap.org/way/192225283)) as named-area context. Neither the crime's exact point nor an independently verified block boundary is claimed. Broad Sector V references retain their unresolved location limits; no rectangular sector danger zones are invented.

Mapped lighting uses [OSM `lit`](https://wiki.openstreetmap.org/wiki/Key:lit); a map tag does not prove lamps work tonight. Footways and sidewalk tags describe mapped infrastructure. Land-use/parks/water describe surroundings only; industrial, wooded, residential and water-adjacent areas receive no automatic danger rating. **Pedestrian activity stays unknown** because no reliable live local activity feed has been obtained.

Opening hours use [OSM `opening_hours`](https://wiki.openstreetmap.org/wiki/Key:opening_hours), evaluated in India wall time at approximate arrival. Listed-open/closed remains unconfirmed. Unsupported holidays, solar schedules and malformed hours stay unknown. A place about to close within ten minutes is labelled closing soon. The solar phase is an astronomical estimate using SunCalc; it does not measure rain, clouds, ambient light or lamp output. Nearby-list arrival estimates use map distance and an assumed walking speed; the provider's actual route can take longer.

## Matching and route preferences

- Route pieces are at most 10 m. A map-road match requires direction agreement and every point of the piece within 8 m. Names must agree when both are available. Near-equal matches to separate roads, bridges/tunnels and unresolved levels stay unknown.
- Area intersections use segment/polygon clipping, including sparse crossing geometries and holes. Touching a boundary does not imply passing through the area. Overlap measures route length inside the named polygon, not proximity to a guessed incident pin.
- Facility walking connections use shared OSM node IDs. The graph does not invent connections across nearby roads, walls, gates or private access. A listed facility without a mapped entrance stays unconfirmed. Network access still does not guarantee operational assistance.
- Walking time is the default. A user can allow 3, 5 or 10 extra minutes. Preferences require at least two eligible alternatives, fresh map data, at least 90% map matching, and no known access restriction on candidates.
- Lighting comparisons also require at least 90% lighting information on every eligible route. Promotion requires over 30 m improvement even after treating the candidate's unknown lighting as unlit. Nearby-place comparisons need connected facilities and sufficient listed-hours evidence. Neither preference estimates crime probability.
- Comparisons expire after 15 minutes or the earliest matched reviewed-observation expiry. Observations must still be valid at estimated arrival. A map snapshot older than 30 days cannot support preference ranking.
- Area avoidance is explicit, is checked against returned route geometry, and preserves previously accepted avoidances. If the start/destination is inside the requested area, the app explains that whole-area avoidance is impossible. Empty alternatives and provider failures preserve the current plan/route.

On the real Technopolis → Wipro and BG Block → BJ Block checks, **lighting-known and walkway-known distance were both 0 m**. The route geometry often matched roads, but those roads lacked the necessary condition tags. Both preferences correctly remained unavailable. OSM record counts do not solve this gap. Current official/partner lighting/access records and real independent validation are still required; see [prepared partner requests](PARTNER_REQUESTS.md). No organization has been contacted.

## Departure monitoring

Before starting, enable **Check on me if I leave my route**, select a two- or five-minute response window, and review the named recipients. Protection defaults off. It monitors departure from the selected route; it cannot determine why a person changed direction.

A departure needs at least four increasing GPS readings spanning 45 seconds, no gaps over 20 seconds, accuracy at most 35 m, and distance over both 60 m and twice the reported accuracy. Implausible walking jumps over 6 m/s reset the candidate. Duplicate/old readings cannot arm the timer. Selected entrances have exclusion buffers to accommodate route snapping.

The candidate and route revision persist on the phone. The API independently validates the submitted trail, opt-in and selected window. An existing pending personal/route check-in is retained instead of creating a second deadline. A changed route or uncertain GPS resets the candidate.

The pending screen and notification offer SAFE/SOS, an alternative route, and nearby places. **I'm safe · change my route** confirms safety before requesting a proposal; merely previewing an alternative does not cancel the timer. SAFE gives three minutes of departure grace. Accepting a new route resets detection and gives one minute of grace. Ending the journey cancels pending escalation and closes shared location access.

Once **server registered** is shown, the deadline survives subsequent phone disconnection. If unanswered, the existing n8n Cloud/Twilio pipeline requests eligible contact calls/SMS once, explaining a missed check-in after route departure and the age of the last recorded position. Live alerts can include a private two-hour journey link; revocation and journey completion stop sharing. Delivery, acknowledgement and SAFE are distinct states.

Before registration, offline detection creates a local pending check-in and retries through the durable outbox. No remote alert is guaranteed without connectivity. A stale trail cannot register remotely; the unanswered local departure check stays active and can request SOS when connectivity returns. A fresh server ACTIVE response clears a completed offline SAFE recovery. A timely offline SAFE remains subject to existing recovery rules; a late SAFE cannot reverse an already expired server deadline. GPS permission, background tracking and phone power are required to detect a departure before a timer has been registered. The prototype thresholds need real device/urban walking evaluation. Trial recipient restrictions, provider failure and unavailable delivery are displayed honestly.

## Operations and verification

```bash
python3 scripts/collect_walking_data.py
node scripts/publish_walking_data.mjs evidence/saltlake/environment/walking.v1.json api/data/walking-snapshots
```

The collector supports `--compile-only` to compile existing raw downloads. Refreshing uses a new collection-time version, or an explicit unique `--version` value; never replace a published snapshot. Set `WALKING_DATA_PATH` in `api/.env` to the printed `dataset_path`, then restart the API while preserving its database and public address. For Docker, use the corresponding mounted `/data/...` path. `INCIDENT_DATA_PATH` remains separate. Authenticated `/v1/evidence/status` includes the walking snapshot version, collection time, audit counts and loading errors. Missing data produces unknown conditions and ordinary route planning, rather than fake evidence.

```bash
node --test --test-isolation=none api/test/*.test.js
scripts/build_android.sh :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
node --env-file=api/.env scripts/verify_walking_environment.mjs
```

The last command calls the real walking provider against an isolated in-memory API with no contacts and no delivery worker. [Observed pilot routes](../artifacts/walking-live-check.json), [facility waypoint check](../artifacts/nearby-walking-check.json) and [published manifest](../artifacts/walking-manifest.json) record outcomes. See [VALIDATION.md](VALIDATION.md) for automated/emulator checks and the remaining physical-device validation.
