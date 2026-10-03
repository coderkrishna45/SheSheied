# n8n Cloud delivery setup

Use your existing Cloud instance: https://alluvia.app.n8n.cloud. No local n8n installation is needed.

Import **only `n8n/workflows/04_cloud_delivery_v2.json`** for version 2. Workflows 01–03 and `SheShield.json` are historical references and are incompatible with the new API. Disable their old trip/SOS webhooks to avoid duplicate alerts.

## Cloud trial: reuse the existing Twilio credential

The provided `SheShield.json` starts with Telegram and contains two Twilio calls, hardcoded recipients and an old callback address. Its text-message node sends Telegram messages; it has no Twilio SMS node or Android delivery webhook. The Android app needs the v2 delivery workflow.

Save `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` from the same Twilio account in `api/.env`. `TEST_RECIPIENT_ALLOWLIST` contains the personal phones receiving test alerts; `TWILIO_FROM_NUMBER` is the Twilio sender. Set `TWILIO_SMS_FROM_NUMBER` if SMS has a separate sender; otherwise leave it blank. Keep country codes and use one assignment for each variable; a later blank assignment overrides an earlier value. Generate an import using the configured sender and the original Twilio credential reference:

```bash
.tools/runtime/node/bin/node --env-file=api/.env scripts/prepare_n8n_cloud.mjs
.tools/runtime/node/bin/node --env-file=api/.env scripts/verify_twilio.mjs
```

Import `.tools/n8n/SheShield-cloud-import.json` into **n8n Cloud**. It contains the app's calls/SMS branches and the Account SID, with no copied Telegram token or hardcoded recipient. The file is ignored by Git. In **Place Call** and **Send SMS**, confirm the existing **Twilio API** credential under **Predefined Credential Type**. Credential IDs can differ between Cloud workspaces, so select the credential in the editor if it is unresolved. This reuses the credential without creating a second Basic Auth credential. [n8n HTTP Request authentication](https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/README.md).

Create **SheShield worker** Header Auth with name `X-Worker-Token` and value `WORKER_TOKEN` from `api/.env`. Bind it in **Delivery Job**, **Claim Attempt**, **Record Request Result**, **Claim SMS**, and **Record SMS Result**. Check Configuration's sender and Account SID, then publish the workflow. No management API key is required for webhook delivery. The public management API is unavailable during the n8n Cloud trial, so importing and publishing use the Cloud editor. [n8n trial API access](https://support.n8n.io/article/can-i-have-api-access-while-im-on-a-trial).

The Twilio verification script makes GET requests only and reports authentication, sender capabilities and whether allowlisted recipients appear as verified caller IDs. HTTP 401/code 20003 means Twilio rejected the saved credentials. It does not certify SMS delivery or compatibility with trial content restrictions. Twilio's current trial limits custom SMS content and recipients; older accounts can differ. Check the actual account before enabling custom SOS texts. [Twilio trial restrictions](https://www.twilio.com/docs/usage/trials).

If the old sender is not registered on the authenticated account, replace `from_number` in the imported Configuration node with the sender available in the current account's Voice setup. Set `sms_from_number` if SMS has a different sender. Current trial resources can vary by product and recipient; use the current Console's Try out Voice/SMS setup and verify the test recipient there. A missing entry in the legacy verified-caller-ID API still needs a check in the product's Console. [Twilio trial setup](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account).

Changing sender variables locally updates the generated import when you rerun preparation; an already published Cloud workflow needs its Configuration updated in the editor or a fresh import. The webhook URL in `api/.env` must match the published workflow's production POST webhook; saving a URL alone does not register or activate it.

## Configure the portable v2 template

1. In n8n, choose **Import from File** and select `04_cloud_delivery_v2.json`.
2. In **Configuration**, set:
   - `api_base_url`: the supplied expression takes the HTTPS API address from each authenticated delivery job. Keep it to follow changes to `PUBLIC_BASE_URL` without editing n8n for every temporary tunnel restart. A fixed URL also works if it matches `PUBLIC_BASE_URL`.
   - `account_sid`: your Twilio Account SID, beginning with `AC`.
   - `from_number`: your Twilio voice-capable phone number in international format.
3. Create an **HTTP Header Auth** credential named `SheShield worker`:
   - Name: `X-Worker-Token`
   - Value: the `WORKER_TOKEN` from your local `api/.env`.
   - Select this credential in **Delivery Job**, **Claim Attempt**, and **Record Request Result**. Delivery Job's authentication must be Header Auth.
4. Create/select an **HTTP Basic Auth** credential for **Place Call**:
   - User: Twilio Account SID.
   - Password: Twilio Auth Token.
   - Do not place the token in a Code or Configuration node.
   - For cloud SMS, select the same Twilio credential in **Send SMS**. Set `sms_from_number` in Configuration if SMS uses a different Twilio number; otherwise it uses `from_number`. The SMS sender must support messaging for the recipient country.
   - Select **SheShield worker** Header Auth in **Claim SMS** and **Record SMS Result** as well. Existing cloud credentials can be reused; no local n8n process is needed.
5. Save and publish/activate the workflow. Use the production webhook URL:
   `https://alluvia.app.n8n.cloud/webhook/sheshield-delivery`.
6. Set `TWILIO_AUTH_TOKEN` in the ignored `api/.env` as well. The API uses it to verify callbacks. Your Twilio account's outgoing calls must be allowed to the chosen test recipient; trial accounts restrict recipients.
7. Set `TEST_RECIPIENT_ALLOWLIST` to the international numbers whose owners agreed to your test. Set `LIVE_ALERTS_ENABLED=true` only when ready for actual calls. Restart the API after changing its environment.
   - Set `LIVE_SMS_ENABLED=true` only after publishing the worker with **Is SMS Job → Claim SMS → Build SMS → Send SMS → Record SMS Result**. Leave it false for the older call-only worker.
8. In the Android app, set its API URL and enrollment code under Settings → Demo connection. Start with `/ready` and a live route calculation. For a real SOS test, use a consenting contact and keep the API and tunnel running.

The API dispatches one job; the worker must claim it before calling Twilio. Duplicate claims fail. Ringing, no answer, completed without acknowledgement, and acknowledgement are separate states. Pressing **1** acknowledges the alert and stops future queued calls. A lost request response produces **REQUEST_UNKNOWN**, rather than placing a duplicate call. Cancel stops future escalation; an already ringing call or sent message cannot be recalled.

Cloud SMS is queued once for each eligible contact when SOS is created. It uses separate durable attempts and signed callbacks, showing queued/requested/sent/delivered/undelivered separately from voice. An SMS marked delivered never acknowledges safety. Cancelling prevents queued texts; a text already claimed can still arrive and report its final status. Uncertain sends are not automatically repeated. Rehearsal never dispatches cloud SMS. Device SMS and the SMS composer remain optional phone fallbacks; enabling both SIM texting and cloud SMS can result in both channels reaching the same contact.

The phone's API URL is the SheShield API's HTTPS address. `https://alluvia.app.n8n.cloud` is the automation workspace, and the delivery production webhook belongs in `N8N_WEBHOOK_URL` on the API. It cannot substitute for the app's REST API.

To inspect an already configured cloud workflow, create a key under **n8n Settings → n8n API** and save `N8N_API_KEY` in ignored `api/.env`. Then run `node --env-file=api/.env scripts/verify_n8n_cloud.mjs`. This reads workflow structure and credential bindings without executing workflows or displaying secrets. The API key is for management; normal delivery uses the separate `X-Worker-Token`. [n8n API authentication](https://docs.n8n.io/api/authentication/).

Twilio Auth Token must also be present locally for callback signature validation even when Twilio credentials already exist in n8n. A trial account requires verified SMS recipients; account balance, sender capabilities and country permissions affect actual delivery. India has different domestic and international messaging routes, so check the route supported by your existing account rather than assuming DLT registration is needed for every sender. [Message resource](https://www.twilio.com/docs/messaging/api/message-resource), [India SMS guidelines](https://www.twilio.com/en-us/guidelines/in/sms).

Workflow execution payload saving is disabled to avoid retaining contact/location data in routine execution history. View provider call logs and API delivery states when troubleshooting. Never test by POSTing arbitrary attempt IDs or bypassing the API claim step.

The historical source workflow contained exposed credentials. Rotate any credentials that were shared with that file. New documentation and the v2 workflow contain no secret values.

## Recipient refresh and companion SMS

Set `TRIAL_SYNC_VERIFIED_RECIPIENTS=true` on the API to refresh verified caller IDs using the saved Account SID/Auth Token. This uses read-only Twilio requests and needs no additional API key. Only an active Trial account's verified recipients can extend `TEST_RECIPIENT_ALLOWLIST`; paid accounts retain the explicit allowlist. Circle → Check cloud calls & SMS refreshes immediately. The API also refreshes in the background without delaying check-in deadlines.

The current Cloud v2 workflow already accepts generic claimed SMS work. Selected-recipient companion jobs use that same SMS branch, sender, Twilio credential and signed callback URL. No local n8n server or new workflow import is required. Delivery statuses are shown separately from acknowledgement; unknown requests are not blindly repeated. Changes to Circle sync into active journeys, while an already-created alert keeps its original recipient set.
