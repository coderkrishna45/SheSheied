# Salt Lake walking condition preview

This presentation uses real walking directions and a **synthetic condition overlay**.
It is available in Live mode. GPS, manual SOS, departure check-ins, companion SMS
and battery protection keep their normal live behaviour.

The app labels the overlay on route cards, the map, insights and active journeys.
The preview can be disabled in Settings → Route comparison before calculating a
new plan. `SALT_LAKE_CONDITION_PREVIEW=false` disables it on the server.

## What the colours mean

- Green: a more supportive sample profile (continuous lighting, regular foot traffic,
  continuous pedestrian space).
- Amber: a mixed sample profile (intermittent lighting, light foot traffic,
  shared pedestrian space).
- Red: a more exposed sample profile (limited lighting, sparse foot traffic,
  interrupted pedestrian space).
- Grey: outside the presentation area or insufficient map matching.

These are scenario assumptions, **not measured conditions or danger classifications**.
Green does not mean safe. No crime probability is calculated.

## Reproducible comparison

`conditions.preview.json` defines the scenario extent and three profiles. Mapped road
classes assign profiles solely to construct the scenario. Two explicitly synthetic
zones illustrate sparse activity and limited lighting on otherwise supportive streets.
They describe hypothetical conditions in fixed locations, not observed danger areas.
Actual pedestrian safety
cannot be inferred from road class: a main road could have dangerous traffic and a
footpath could be well lit and busy.

The engine clips routes to the extent, splits geometry into sections of at most 10 m,
and matches each section to existing OSM geometry within 20 m with direction agreement.
Close competing matches with different profiles stay unknown. Adjacent sections with
the same profile merge for drawing. Shared streets have the same scenario conditions;
identical geometries are never deliberately assigned different levels. Zone boundaries
are clipped exactly; a long geometry segment cannot colour its entire road red.

Comparison requires at least 85% sample coverage for every candidate. Weighted
exposure is the sum of green metres × 0.15, amber metres × 0.50, red metres × 0.85
and unknown metres × 1.0. A preview recommendation must fit the selected additional
walking-time limit and have no mapped access restrictions. Improvements below 30
weighted metres favour the quicker route. The overall label is exposed for at least
150 red metres or an average profile score of at least 60; mixed for at least 150
amber metres, 50 red metres or an average score of at least 32. This keeps a significant
exposed stretch visible even within a longer supportive walk. A single option receives no comparison
recommendation. Similar routes can legitimately have the same level; cards still
show the metres associated with their scenario conditions.

The provided CSV stays unmodified. Its area reports and POIs do not enter synthetic
scores. The synthetic overlay never adds incidents, reporting coverage, lighting
observations or automatic crime check-ins to the real evidence system.

For a presentation, explain: “Directions and monitoring are live. The labelled Salt
Lake condition preview shows how the comparison works when street conditions are
available. The current real dataset does not establish street safety.”
