# Low battery protection

During a live journey the Android foreground service reports battery level, charging state and its last recorded position every 30 seconds. At 10% or below, without charging, the backend arms a five-minute silence timer. The watch and position are stored in SQLite, so the timer continues after the phone stops or the backend restarts.

If no fresh heartbeat reaches the backend by the deadline, it queues one cloud SMS for each eligible Circle contact through the existing n8n Cloud delivery worker. The text includes the last reported percentage, recording age, nearby address when available, GPS accuracy and a map link. It says the battery **may** have run out or the connection may have failed. A missing heartbeat cannot establish that the battery is dead.

Charging, recovery above 15%, disabling protection, or ending the journey stops the watch. A heartbeat after an alert cancels queued texts and marks the phone reconnected. Fresh GPS uploads also prove the phone is reporting and prevent a false outage alert; delayed old fixes do not extend the timer. The newest stored position is used in the alert. Already requested/sent texts cannot be recalled. The same battery episode cannot alert again until charging or recovery; duplicate/outdated heartbeat timestamps do not extend the timer. Offline heartbeats are not queued for later replay.

An active journey and a confirmed server heartbeat are required. Without internet before the low-battery reading reaches the server, no new watch can be registered. Without a GPS fix, the SMS states that no location was available. Twilio trial recipient restrictions still apply. Server and public callback connectivity must remain available.

## Demo

Open **Settings → Battery protection & demo → Try demo**, or **Low battery protection** during a journey. The server saves a simulated 5% battery reading and position, then runs a 20-second silence timer. The screen shows simulated Circle messages. This default demo makes no calls and sends no real SMS.

For a real delivery demonstration, choose **Send a real demo SMS**, select one Circle person, and confirm. After the 20-second server timer, one real cloud SMS goes to that recipient. It begins **DEMO: simulated battery and location** and says **No emergency.** The compact ASCII text avoids expanding into many Unicode SMS segments, which Twilio trial accounts reject. The screen tracks provider delivery separately. Closing the demo prevents an unclaimed message from being sent; it cannot recall a message already requested. Repeated SMS demos are limited to one per minute.

## Spoken SOS location

Reverse geocoding resolves the last position to a readable nearby address through OpenRouteService. Matches farther than 200 m are rejected. The call says “near [address]” and how old the position is. GPS numbers remain in the SMS map URL. If an address cannot be confirmed in the bounded lookup, the call directs the recipient to the SMS map rather than inventing an address or reciting coordinates.

## Route alternatives

The provider gets a full alternatives request, then a lighter two-route request on a transient failure, then a single walking route if both alternative calculations fail. Every attempt preserves endpoints, via points and avoidance polygons. The total provider budget is 26 seconds, below the phone's route timeout. Credential, rate-limit and invalid-input errors are not retried this way.

Successful geometry is reused for five minutes, while evidence and route preferences are evaluated again. A recent multi-route result is not replaced by a single degraded result during restart seeding. Degraded single-route results allow retrying for alternatives. The comparison screen distinguishes “only one distinct route found” from “alternatives temporarily unavailable” and offers **Refresh walking options**. Only real provider geometries are shown; multiple valid routes cannot be promised for every pair of endpoints.
