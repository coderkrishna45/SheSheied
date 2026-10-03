# Salt Lake evidence: sources, locations and limits

## What is installed

The pilot covers Salt Lake research, with priority Sectors II and V. The first dataset is [reports.v4.json](../evidence/saltlake/reports.v4.json): **five real published reports, zero admitted street incidents, zero current observations, and zero complete reporting areas**. Two reports are historical. Source checks were automated; no independent human location checks have been invented.

This is a small convenience sample from one publisher. It does not describe the frequency or distribution of crime across Salt Lake. Reports are linked with short original summaries; article text, photographs, victim identities and residential addresses are not redistributed. A source check establishes what was reported, not whether an allegation is proven.

The app displays these references as wider-area context. No report is assigned to every street in its sector. The search rectangle is a coarse research filter, not an official sector boundary, crime location or reporting coverage.

## The sources we can actually use

Research checked on 2 October 2026:

| Source | Use | Limit |
| --- | --- | --- |
| [Bidhannagar Police station directory](https://bidhannagarcitypolice.gov.in/police_station.php/) | Appropriate contacts for Salt Lake incident-location requests | Station/arrest addresses are not incident locations; no complete public street feed is installed |
| [NDITA](https://ndita.org/) | Sector V authority listing street-lighting services; request dated faults, repairs and walking-access records | A lamp inventory or tender does not prove working lighting now |
| [Safetipin Kolkata audit](https://safetipin.com/wp-content/uploads/2021/04/social-vulnerability-audit-report-in-kolkata-safetipin-2021.pdf) | Evidence that a provider has audited Kolkata streets | Its described 2019 collection is historical, not current Salt Lake conditions or a license for this app |
| [Safetipin data integration](https://safetipin.com/data-for-change/) | Potential licensed audit partnership | Delhi/Pune integrations do not establish our access to a current Salt Lake feed |
| [Safecity data policy](https://webapp.safecity.in/privacy_policy) | Potential deidentified community-report partnership | Institutional access requires a request; community reports are not official criminal records |
| [NCRB district catalog](https://www.data.gov.in/catalog/district-wise-crimes-committed-against-women) | Regional reported-crime context | District totals cannot locate incidents on a 1 km walk |
| [CCTNS description](https://www.mha.gov.in/en/divisionofmha/women-safety-division/cctns) | Explains police information systems and citizen services | Does not give this project access to a bulk street-location feed |

See [source decisions](../evidence/saltlake/SOURCE_RESEARCH.md) and the concrete [partner requests](PARTNER_REQUESTS.md). No organization has been contacted or agreed to supply data. The user's own field survey is not a dependency; authorized provider records and real independent source/location reviewers can supply the needed evidence.

## Admission and matching, version 4

`api/src/street_evidence.js` enforces the current format. Its data steward must establish the original source, permission, accuracy and reviewer identities outside the parser. **A pair of reviewer IDs does not authenticate people or prove independent work.** The current dataset remains explicitly `independently_validated: false`.

1. Register sources with HTTPS references, geographic bounds and reuse basis: `public_reference`, `open_license`, or `permission_granted`. Public links are not an open-data license.
2. Preserve publisher record IDs and a shared event ID. Check publication, retrieval and review dates. Preserve the event date as an interval (`exact`, `approximate`, `day`, `month`, or `range`); do not substitute publication date for incident date. A report from today can retain its whole calendar-day interval before that day ends; the publication bounds occurrence and no hour is invented.
3. Classify the reported setting and status. Private, campus and transport incidents remain separate context. A police-record source or news report does not imply conviction.
4. Choose a location: `street_section`, `possible_sections`, `named_area`, or `unresolved`. Only a referenced public street section, uncertainty at most 25 m, and two distinct real human/provider location reviews can become street evidence. Review source, aliases, sides, entrances, parallel roads, bridges, walls and road levels. A rejected review blocks admission pending resolution. Software checks these declarations; it cannot inspect every physical barrier itself.
5. A street section must follow its registered road geometry: samples every 5 m must be within 25 m, and the section must be no longer than 2 km. Conflicting sections or publisher IDs reused for different events are quarantined. Case linkage across articles remains a steward responsibility.
6. Compare the actual walking route in pieces up to 10 m. Match the routing instruction's street name or reviewed alias, line direction, and section geometry within 15 m. Unnamed or unmatching paths remain unresolved. Nearby parallel roads and perpendicular crossings do not inherit a report. Side-specific and level-specific evidence are not supported and are rejected. Same-named parallel or stacked roads still require provider GIS and independent review; name matching alone cannot resolve them.
7. Only event intervals wholly inside the last 365 days can contribute a street count. Older events remain historical context and age out again at request time. Reports matched to a short section are not extended along the whole road.

**10 m is calculation resolution, not claimed crime-location accuracy.** Names, aliases and incomplete map geometry can also cause missed matches. The tests establish conservative behavior on synthetic edge cases; real attribution accuracy is still unmeasured.

### Observations and reporting coverage are different

Street-condition observations need an authorized official/partner source, real direct observation, evidence reference, two actual reviewers, public street geometry and an expiry. Maximum prototype TTLs are 24 hours for lighting/obstructions and 6 hours for walking-access closures/openings. They expire at request time and are checked against estimated arrival when comparing walking conditions. Opposing observations stay visible as unresolved and cannot establish observation coverage. Daylight/after-dark observations apply only to matching estimated solar phases and street sections. Comparison validity ends at the earliest matched observation expiry or after 15 minutes. This prototype arrival model uses the provider duration; it does not measure weather, walking speed or actual lamp output. These thresholds require provider validation.

Reporting coverage needs a licensed official/partner complete geocoded feed, method reference, all supported categories, public-space inclusion, matching total/geocoded counts reconciled to the supplied public-space records for each area and window, the analysis-year window and updates/window end within 30 days. Unresolved current public-space rows and rejected records block completeness. The whole 150 m corridor must fit inside conservative supplied collection rectangles. News and the research rectangle never declare coverage. This means coverage of supplied reporting, not completeness of all crime or absence of unreported harm.

**Live safety always remains UNKNOWN.** Walking time is the default. Explicit map-condition preferences require comparable coverage and a supported improvement; the real pilot routes currently fail these coverage gates. The legacy numerical score fields are zero compatibility placeholders and must not be interpreted as risk estimates. Current reviewed conditions and incident history are explained, never converted into a claimed probability of harm. The fictional recorded rehearsal keeps its old exposure simulation and cannot certify live streets.

## Review, validate and publish

Use Node 24 (the portable workspace binary is `.tools/runtime/node/bin/node`):

```bash
node scripts/audit_incidents.mjs evidence/saltlake/reports.v4.json
node scripts/evidence_workbench.mjs evidence/saltlake/reports.v4.json artifacts/saltlake-review
node scripts/evaluate_evidence.mjs evidence/saltlake/reports.v4.json evidence/saltlake/independent-reference.json artifacts/saltlake-accuracy.json
node scripts/publish_evidence.mjs evidence/saltlake/reports.v4.json api/data/evidence-snapshots
```

The review packet is a local HTML source browser plus an empty review template. Real reviewers independently inspect and enter supported street geometry and completed reviews into a **new** source dataset version. Blank reviews and automated identities never pass street admission. Maintain a steward identity registry privately; do not publish names/emails or copy victim narratives into summaries. All location proposals are reviewed against the source, not generated from news keywords.

The evaluator compares admitted street IDs with an independently prepared reference sample. It reports wrong-street assignments, missed resolved cases and false attribution of unresolved cases. Empty references produce `UNMEASURED` and null accuracy rates, not 100%. Keep a held-out sample that the geocoder/steward did not use to tune matching, disclose sample selection and size, and inspect route crossings/parallel paths separately. Do not invent test cases as real evaluation observations.

The publisher refuses rejected records and writes an immutable version/hash snapshot with a manifest. Set `INCIDENT_DATA_PATH` in `api/.env` to its printed `dataset_path`, then restart the API without changing its database or tunnel. For Docker, use the corresponding snapshot path under the mounted `/data/evidence-snapshots/` directory rather than the host absolute path. Authenticated `/v1/evidence/status` exposes version, SHA-256, audit counts, source registry, current observations and coverage. Routes retain the version and evaluation time used to calculate them. The API loads a snapshot at startup; published corrections require a new version and restart. Existing journeys retain their chosen geometry and watches; recalculating a route reads the newly installed data.

Version 3 files remain readable for compatibility, but their nearby point reports are explicitly uncertain street context and cannot produce live safety rankings. `scripts/export_pinecone.mjs` writes unreviewed staging only; Pinecone similarity cannot establish geography. `n8n/workflows/01_plan_trip_risk.json` is retired and refuses execution. Use the API for planning and Cloud workflow 04 for delivery.

## Before claiming useful local accuracy

Obtain real licensed incident/observation records, two independent qualified location reviewers and an independent reference sample. Publish measured wrong-street and missed-match results, source omissions and freshness. If suitable street data cannot be obtained, present this as a transparent journey companion with known gaps, personal watches and rerouting; a comprehensive criminal-map claim is unsupported.

Named-area report outlines and other walking factors are described in [WALKING_CONDITIONS.md](WALKING_CONDITIONS.md). These outlines refine context; they do not admit any of the five reports as street incidents.
