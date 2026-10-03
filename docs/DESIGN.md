# Waymate visual design

An iOS-inspired hierarchy built with native Android controls: large titles, grouped rows, quiet surfaces, consistent icons, rounded sheets and generous touch targets. No proprietary Apple fonts or assets are bundled.

## Shared system

- Ink blue actions, neutral backgrounds and teal status accents. Amber communicates uncertainty; red marks emergency or destructive actions.
- Light and dark palettes, native system typography with scalable text, 48 dp icon targets and 52 dp primary controls.
- Shared dialog, sheet, input, notice and button components. Long details scroll; sheet titles and close controls remain visible.
- Route cards prioritize walking time. Sources, wider-area reports and missing information remain available through Route insights. Unknown coverage never becomes a safety claim.
- Safety check-ins emphasize the countdown and response actions. Remote timer registration, delivery and acknowledgement remain separate states.
- API setup lives in Settings → Service connection. The companion webpage follows the same palette and typography.

## Previews

[Home](../artifacts/design-home.png) · [Settings](../artifacts/design-settings.png) · [Dark route comparison](../artifacts/design-routes-dark.png) · [Safety check-in](../artifacts/design-check-in.png) · [Contact updates](../artifacts/design-sos.png) · [Companion page](../artifacts/companion-watch.png)

## Validation

Android build, JVM tests and lint completed. The device regression inflates message, choice and input dialogs plus sheets in both appearances. Emulator interaction covered route comparison, source sheets, a practice watch acknowledged before expiry, and simulated SOS contact updates. Companion browser checks passed acknowledgement, stale location and ended-link privacy. No real calls or SMS were sent during this redesign.

The APK is a debug build. Physical-device layout, TalkBack and enlarged system text still need a separate review; those are not claimed as tested. Existing lint warnings remain.

## Design references

Apple’s [typography](https://developer.apple.com/design/human-interface-guidelines/typography), [color](https://developer.apple.com/design/human-interface-guidelines/color) and [alert](https://developer.apple.com/design/human-interface-guidelines/alerts) guidance informed hierarchy, readable status colors and concise confirmations. Android navigation, permissions and native controls remain intact.
