> Historical foundation checkpoint. For the current channel implementation and activation status, see CONNECT-CHANNELS.md.

# PRCUISA Connect v1.2 — implementation checkpoint

## Assessment
Existing modular Next.js App Router monolith, Supabase PRCUISA ID, workspace owner/editor/viewer roles, centralized plan_entitlements and platform_access, JSON/SQL app registry, server-validated tool RPCs, Vercel preview. Existing roles do not contain a distinct financial-report permission. This first release restricts financial reports to owners. No second identity or subscription is introduced.

## Delivered foundation
/connect and /connect/preferences use existing Hub/workspace shell; preview is /preview/connect. All six channels are represented accurately. In-app is implemented; external channels are unavailable. Personal workspace preferences store daily time, IANA timezone, domains and opt-in. Default 21:00 Asia/Jakarta. Owner-only report preview contains real independent sales/finance/invoice/QR values, never summed across tools. Static QR scans are explicitly unavailable. Notifications support read-all; history is bounded to the latest 25.

Database migration: 20261013043024_connect_foundation.sql, applied after prior migrations. Every module table has RLS and explicit grants. Browser writes use authenticated, authorized RPCs. Notifications/preferences SELECT policies enforce recipient plus current membership. Internal tables and worker RPC are not callable by browser roles. Existing plan capability `connect` controls access/optional monthly delivered quota; future channel-specific keys are not commercially enabled.

Transactional ID-only outbox triggers cover sales completion, finance record creation, saved QR creation and supported Invoice & Quotation events. Outbox consumption/immediate alerts are not enabled yet. Immutable report snapshots live in connect_report_runs. PostgreSQL queue uses FOR UPDATE SKIP LOCKED and executes in-app delivery, attempt record, notification and usage atomically. Crash rolls back all work; repeated worker runs do not duplicate deliveries. This in-app transaction design needs no provider lease. External delivery will require leases before any adapter is enabled.

## Worker deployment
Run `npm ci --include=dev`, then `node workers/connect-worker/index.mjs` under a persistent process manager. Polls every 15 seconds, exits on SIGTERM/SIGINT after current work/sleep, retries failed database ticks on next poll. Environment:
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (trusted server/VPS only)
No new secrets in browser code. Production should replace broad service-role credentials with an isolated worker database role/RPC grant where supported. Monitor worker error logs and pending queue age. Worker is NOT deployed by Vercel deployment.

Before activation, apply migration to staging, run tests, start worker, opt in, send test, verify inbox and usage, then verify a due schedule. The current preview deployment does not apply migrations or start workers.

## Security and verification
Run `node tests/connect.mjs`, `node tests/kasir.mjs`, `npm run test:security`, `npm run typecheck`, `npm run build`. No lint script currently exists. Tests cover identity/workspace boundary, owner-only access, private inbox, worker-only execution, duplicate scheduler calls, test rate limit, timezone validation, entitlement revocation and read state. Remote DB advisors and desktop/mobile browser QA remain required before rollout.

## Remaining roadmap / acceptance gaps
1. Telegram: token hashing/expiry/single-use linking, verified private chats, webhook secret validation, encryption, adapter and provider tests.
2. External queue: lease ownership/visibility timeout, attempts, backoff 1/5/15/60 minutes, dead letters, provider accepted vs delivered status, disconnect revalidation, channel quotas.
3. Reports: previous-cutoff to midnight activity is carried in a separately labeled catch-up section. No invoice outstanding/payment/overdue metrics yet. Finance measures records created in the period (not a backdated ledger); backdated corrections require a separate policy.
4. Outbox processor, recipient rules and immediate alerts; event immutability has no client write surface, but no full canonical event registry yet.
5. WhatsApp: WAHA shared sender on private VPS, protected admin API, persistent volume, explicit consent and verified recipient challenge, health monitoring. No sender/container is provisioned here.
6. Email: verified sender/recipient, provider adapter, bounce callback, optional report unsubscribe.
7. Push/webhook P1: VAPID/service worker, device revocation; HMAC and hardened SSRF/DNS/redirect checks respectively. No outgoing request controls enabled prematurely.
8. Additional financial roles, quiet hours, notification pagination/filters, per-channel preferences, encrypted connections, retention jobs and operator dashboard.

The complete v1.2 definition of done is NOT met by this foundation checkpoint. No real Telegram/WAHA/email message is sent or claimed delivered.

## Architecture plan for next phase
Preserve one delivery queue; add connection_id, lease owner/expiry, next_attempt_at, provider message ID and unique logical delivery identity. Adapters return accepted/retryable/errorCode, never read arbitrary workspace data. Reauthorize recipient, membership, consent and quota immediately before send. Use AES-GCM destination encryption with versioned server key and hashed lookup. Store linking token hashes only. Report engine queries each domain with explicit source references; never sum sales and finance as a combined income. Do not build a universal financial table until an actual cross-tool import exists.

## Rollback / retention
Stop worker first. Disable Connect registry entry and entitlement; do not drop tables containing notifications/audit records. Revert UI deployment independently. Before a destructive schema rollback export Connect tables and remove only Connect triggers/functions in reverse dependency order, then tables with explicit operator review. No CASCADE rollback is provided. Retention/delete jobs are not implemented; define a policy before collecting external connection data.
