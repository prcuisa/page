# Connect channels and dashboard authentication

## Implementation status
Dashboard `/dashboard` now permits an unauthenticated preview without exposing business data. Its Masuk / Daftar opens an accessible native dialog, reusing existing email/Google/Firebase-to-Supabase flows and one PRCUISA ID. Real protected tools retain server authentication and workspace checks. The Connect icon is Lucide Plug throughout Hub.

Channel setup is in Connect, without separate tool accounts. Telegram uses a single-use expiring bot link and secret-header webhook; WhatsApp and email use consent plus a six-digit challenge, five attempts, ten-minute expiry. Web Push requests permission only after a button click and stores the encrypted browser subscription. Webhooks use an encrypted generated signing secret displayed once; disconnect and reconnect rotates it. Disconnect cancels pending/processing deliveries. Existing accepted messages cannot be recalled.

One queue handles in-app, Telegram, WAHA, Resend, push and HTTPS webhook. External delivery uses leases, conditional acknowledgement, five attempts, transient-only retries and usage metering on first successful acknowledgement. Provider acceptance is not displayed as confirmed delivery. In-app is atomic. Outbox processing supports immediate opt-in alerts; reports fan out to verified connections. Sensitive report values remain behind authenticated Hub links in external messages.

## Activation requirements / current blocker
No remote database or worker has been changed. Vercel environment listing returned 403; CLI has no login credentials. The visible active Supabase project contains a different family-finance schema, so it was not modified. Configure the actual Hub project rather than applying these migrations to an unrelated database.

Apply the existing Connect foundation migration and `20261013060626_connect_channels.sql` to the correct Hub staging database. Combined schema is for a fresh installation only. RLS, private connection records, service-only challenge/lease functions, identity/workspace checks and encrypted destinations are included.

Configure Vercel AND the persistent worker:
- Existing Supabase URL/publishable key; server-only service role key.
- CONNECT_ENCRYPTION_KEY: random 32-byte key as 64 hexadecimal characters. Back it up securely. Losing it invalidates destinations; key rotation currently requires reconnecting recipients.
- CONNECT_APP_URL: canonical HTTPS Hub URL, not a temporary protected preview.
- Telegram token, username (without @), strong webhook secret. Register `/api/webhooks/telegram` with Telegram setWebhook and the same secret_token. Only private chat linking is accepted.
- WAHA_URL: HTTPS proxy to the private WAHA deployment; API key; default sender session. Pair the dedicated sender in the protected WAHA admin dashboard. Recipients verify with a code; they do not pair their own sender session.
- Resend key plus verified sender in CONNECT_EMAIL_FROM. Recipient code proves access to email.
- VAPID public/private key and subject (mailto contact). Generate once with the installed web-push package. Public key may be shared; private key stays server-side.
- CONNECT_WEBHOOK_ENABLED=true only after egress controls and signed-receiver tests pass.

Worker: build using `docker compose -f workers/connect-worker/compose.yaml up -d --build` with environment supplied securely. Optional WAHA sample is in waha.compose.yaml; set a reviewed pinned image, credentials, persistent volume, TLS reverse proxy and network restrictions. Do not expose port 3000 publicly. No VPS was provisioned or paid service purchased.

## Webhook receiver contract
Headers: X-PRCUISA-Delivery, X-PRCUISA-Timestamp (Unix seconds), X-PRCUISA-Signature (`sha256=<hex>`). Compute HMAC-SHA256 over timestamp + '.' + exact raw JSON body with the displayed secret. Receiver must validate signature, allow a short timestamp window, and deduplicate event_id. Retries reuse event_id. Payload is a notification/link, not a financial document. HTTPS public IPv4 only, default port 443, no redirects, no userinfo. DNS answers are validated and pinned for every request; private, loopback, link-local, reserved and IPv6 destinations are rejected. IPv6-only endpoints are a current limitation.

## Test and acceptance
`npm run typecheck`; `node tests/connect.mjs`; `node tests/connect-channels.mjs`; `node tests/connect-providers.mjs`; `npm run test:security`; `npm run build`.
Channel tests cover privilege boundaries, token replay, retry leases, deduplicated usage and revocation. Provider tests mock responses; they do not claim real delivery. Encryption tests include tampered authentication tags. SSRF tests include private IP/ports/protocol rejection. Complete real opt-in delivery tests on all configured channels before calling them launched. Desktop/mobile browser and actual cross-device push QA remain pending.

## Remaining limitations
Quiet hours, individual per-channel domain preferences, bounce/delivery callbacks, provider health dashboard, operator dead-letter requeue UI, retention automation, notifications beyond latest 25, per-device push management UI, and detailed outstanding invoice metrics remain incomplete. Financial reports are owner-only. Channel-specific commercial quota rules are not yet separately implemented; current centralized Connect quota applies globally. No claims of complete PRD v1.2 acceptance or uninterrupted WAHA service.
