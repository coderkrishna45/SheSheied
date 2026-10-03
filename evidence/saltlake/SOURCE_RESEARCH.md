# Salt Lake source decisions

Checked 2 October 2026. Pilot requested by the user: all Salt Lake, especially Sectors II and V; no personal field survey. Research searched for Salt Lake/Sector II/Sector V crime, harassment, snatching and street conditions, and inspected original reports and relevant agency/provider pages. This is targeted convenience sampling, not an exhaustive crawl, random sample, official feed or automatic daily updater.

## Retained references

The exact source URLs, publication times, date intervals, scope reasons and automated review identities are in [reports.v4.json](reports.v4.json). All five references come from The Times of India; no independent publisher corroboration or human location review is claimed.

| Publisher record | Event date in India | Why it remains context |
| --- | --- | --- |
| 130400395 | 16 April 2026 | Alleged assault described at a campus gate and CK-CL ground; multiple sites, no independently established walking section |
| 131752430 | 9 June 2026 | Campus-premises allegation; complaint station is not the incident site |
| 129706600 | 19 March 2026 | Vehicle collision near a Sector V bridge; transport history, unresolved bridge/road level |
| 123476595 | 22 August 2025 | Historical BG Block, Sector II report; entrance privacy, escape path is not incident site |
| 122939432 | 26 July 2025 | Historical unnamed Sector V bar exit; street unresolved |

No source text or photographs were copied. Summaries are short original factual references. Reports are not represented as adjudicated facts or a complete crime census. The coarse Salt Lake research box selects context; it does not locate these events. Historical context is kept so it cannot silently acquire a current publication date.

## Exclusions that prevent wrong-location pins

- [Arrest at Sector V office](https://timesofindia.indiatimes.com/city/kolkata/docs-quick-thinking-at-hospital-helps-police-nab-rapist-cousin/articleshow/132317898.cms): the reported incident concerns a private location elsewhere. Do not use the arrest office as the offence site; identifying/sensitive details are not retained.
- [Park Circus chain-snatching report](https://timesofindia.indiatimes.com/city/kolkata/gold-chain-snatching-near-park-circus/articleshow/131126732.cms): Salt Lake is a residence reference, while the reported incident is Park Circus. Excluded from Salt Lake context.
- [Nightclub recollections](https://timesofindia.indiatimes.com/city/kolkata/for-many-women-it-does-not-take-too-long-for-their-nightclub-fun-to-turn-into-a-nightmare/articleshow/124882769.cms): unresolved anecdotes and possible overlap with other reports; publication date does not establish an occurrence date or a new unique case.
- [Sector V transport checks from 2016](https://timesofindia.indiatimes.com/city/kolkata/sec-v-companies-fail-driver-carpool-check/articleshow/52528062.cms): old lighting/transport statements cannot become current direct observations.
- [Hazra–Kidderpore moving-auto report](https://timesofindia.indiatimes.com/city/kolkata/woman-molested-inside-moving-auto-on-hazra-kidderpore-route/articleshow/133686441.cms): outside the Salt Lake pilot; a complaint station is not the moving incident's location.

## Public systems inspected

[Bidhannagar Police's daily arrest directory](https://bidhannagarcitypolice.gov.in/arrest_details.php) publishes arrest material; arrest dates and places are not interchangeable with event dates and sites. It has not been ingested as an incident feed. [The station directory](https://bidhannagarcitypolice.gov.in/police_station.php/) provides contact leads.

[NDITA](https://ndita.org/) lists street-lighting and infrastructure services for Sector V. No dated georeferenced current-condition export has been obtained. [Safetipin's Kolkata audit report](https://safetipin.com/wp-content/uploads/2021/04/social-vulnerability-audit-report-in-kolkata-safetipin-2021.pdf) describes 2019 collection; its age prevents current-condition claims. [Safetipin's integrations page](https://safetipin.com/data-for-change/) mentions Delhi and Pune data integration and Kolkata design work, not project access to current Salt Lake data. [Safecity's policy](https://webapp.safecity.in/privacy_policy) describes institutional requests and deidentified research use; no dataset agreement exists here.

No documented comprehensive public Kolkata street-incident API was identified in this research. This is a research result, not proof that no source exists. NCRB district totals and police-system descriptions cannot fill street coverage. A news geocoder, vector similarity or a denser grid cannot recover details absent from a source.

## Release result and next dependency

Five context records, zero admitted street records, zero observations, zero complete reporting areas. Independent reference sample size is zero; wrong-street rate and recall are **unmeasured**. Synthetic test geometry stays in the test suite and is not production data. See [partner drafts](../../docs/PARTNER_REQUESTS.md) and [admission/publishing instructions](../../docs/INCIDENT_DATA.md).
