# A practical last kilometre

## The everyday reason to use SheShield

A person leaving a metro station at night may feel uneasy about the last 800 m. They do not necessarily want to declare an emergency, and a city-level crime score cannot resolve their concern.

SheShield now supports this sequence:

1. Plan the actual walk. Read the reports and the evidence gaps; missing reports stay unknown.
2. Start **Walk with me** for 2, 5 or 10 minutes, or estimated arrival plus 5 minutes (maximum 30 minutes).
3. Wait for **SERVER TIMER SAVED**. The deadline is persisted by the API; it can expire without further messages from the phone. Until then the screen explicitly says the watch exists only on the phone.
4. Share a private companion link through the phone's share sheet. Someone can open it without installing the app and acknowledge they are watching.
5. Confirm **I'm safe** when through the stretch. If the deadline is missed, the existing contact escalation starts. The app reports whether automatic calls are configured and offers the phone dialer.

This closes a concrete gap: an uncomfortable stretch with no crime data can still have a personal check-in and an acknowledged companion. The companion's acknowledgement is visible separately from contact-delivery acknowledgement after an SOS. It never resolves SAFE, extends the deadline, or implies professional monitoring.

## The demonstration worth showing

Use the Android recorded demo for an offline rehearsal: start a walk, select **Walk with me → 20 seconds**, and either confirm safe or let the simulated contact sequence run. All incident evidence and alerts in that rehearsal are labelled fictional/simulated.

For the server-backed behaviour, run the automated disconnection/restart tests. The companion browser test and observed screenshots are documented in [VALIDATION.md](VALIDATION.md):

```bash
cd api
npm test
```

For a live-mode device demonstration, connect the API and start a short route with unknown coverage. Arm a two-minute personal watch and wait for server confirmation. Share the companion link and acknowledge it in a second browser. Disconnect the traveller's phone. The server will still expire the saved deadline. Actual calls require the existing configured delivery provider and consenting allowlisted contacts; the UI says when they are unavailable. This implementation does not contact emergency services automatically.

Reconnecting after a timely offline SAFE acknowledgement cancels future timeout escalation. An already placed call cannot be recalled. A local “I'm safe” while offline explicitly warns that server cancellation is pending.

## What is distinctive, and what is established

[Safetipin already offers street audits, route guidance and friend tracking](https://safetipin.com/methodology/). [Noonlight already offers a personal safety button](https://help.noonlight.com/en/articles/2114600-how-does-the-button-work). Do not claim we invented those categories or that no competitor has a timer.

The defensible demonstration is the **complete behaviour**: expose a short evidence gap, let the traveller's concern initiate a watch, show server registration and companion acknowledgement separately, then demonstrate a deadline surviving the phone's disconnection. A judge can inspect the evidence and reproduce each transition. No feature guarantees a hackathon win.

## Failure handling implemented

- No incident feed: unknown routes; personal watches still work.
- Stale or imprecise data: excluded from confident street coverage; uncertainty and gaps remain visible.
- No GPS: a personal watch can register; the companion sees no position instead of a fabricated location.
- Offline before registration: local timer only, explicitly labelled; outbox retries registration.
- Offline after registration: the API owns the persisted deadline; local monitoring is an additional path.
- Companion opens an old watch: its event ID cannot acknowledge a newer check-in.
- Someone forwards a link: link possession permits viewing and watch acknowledgement, never safety resolution; the UI does not verify the viewer's identity.
- Repeated taps/retries: stable command IDs and transactional state prevent duplicate alerts.
- End/revoke/delete: public access stops immediately when the server receives the action. Offline stops remain pending until synced.
- A contact is unavailable for remote calls: the queue tries the next configured contact. Provider unavailable/no contacts: reported as unavailable; **Call someone** opens a contact or 112 in the dialer. No automatic claim of delivery.
- Location gets stale: companion page shows age and accuracy. Browser connectivity loss is visible separately.

## What remains before real-world reliance

A licensed local incident/observation partnership; independent validation of reviewed street attribution and barrier handling; evaluation with intended users; delivery checks for additional consenting recipients; stable monitored HTTPS hosting; and validated escalation policies. The Salt Lake source research and review tools are implemented, but complete incident reporting and real street accuracy are not established. Existing provider observations can be requested; the user is not expected to survey streets personally. This build is a working prototype with explicit limits, not validated emergency infrastructure.

## Show the Salt Lake evidence honestly

Calculate an actual short Salt Lake route and open **Why this route? · sources & gaps**. The first snapshot shows five attributable wider-area references, each with event-date precision, setting and a reason it cannot identify that lane. Two remain historical. Show the unknown stretch and use a personal watch or reroute based on the traveller's concern. Do not present a zero report count as a safe street.

The [local review packet](../artifacts/saltlake-review/review.html), [accuracy report](../artifacts/saltlake-accuracy.json) and [partner drafts](PARTNER_REQUESTS.md) make the next data dependency reviewable. They do not substitute for a partnership or independent accuracy measurement.

## Walking conditions and route departure

The app now offers an optional departure check-in after 45 seconds of accurate GPS away from the chosen route, with a two- or five-minute response window and existing Cloud delivery on timeout. SAFE gives detour grace, and accepting a new route resets detection. Nearby mapped places can become real walking waypoints while preserving the destination and pending timer. This gives the traveller a useful action when they feel uneasy, even when crime geography remains unresolved.

Area-report outlines stay separate from current danger claims. Lighting, pedestrian infrastructure, surroundings and facility sources are explained explicitly. The actual pilot routes still lack lighting/walkway evidence and mapped entrance connections, so preferences remain unavailable. Pedestrian activity is unknown. The remaining data work requires real provider records and independent validation; software alone cannot supply it. See [walking conditions and source limits](WALKING_CONDITIONS.md).
