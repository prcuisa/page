# Kasir Pinter beta

Kasir uses existing PRCUISA identity/workspace, platform registry, entitlements and activity. Catalog, integer-IDR checkout, discounts, cash change, manually recorded transfer/QRIS, history, daily summary, printable receipts and optional QR receipt links are included. No automatic Business Report posting.

## Activation
Apply `supabase/migrations/20261013035508_kasir_pinter.sql` after existing migrations (or combined schema for a fresh database). Configure existing Supabase URL/publishable key plus server-only `SUPABASE_SERVICE_ROLE_KEY` for public receipt resolution. Never expose the service key through NEXT_PUBLIC variables. No new identity or billing system.

Receipt sharing is opt-in. A cryptographically random token is returned once; only its SHA256 hash is stored. Links expire after 30 days; rotating or revoking invalidates prior links. Anyone holding a link can read that receipt snapshot, so share only deliberately. Receipt pages use noindex, no-store and no-referrer. The host must be reachable by customers; deployment protection can block scans.

Preview works without backend configuration using session data. Demo receipt contents travel in the URL fragment and are explicitly unsigned/unverified, not official proof of payment. No real customer information should be used in preview.

## Verification
`npm run typecheck`, `npm run test:security`, `node tests/kasir.mjs`, `npm run build`.

Tests cover exact integer totals/change, retries, insufficient cash, invalid discount, stale price, duplicate products, immutable receipt snapshots, quota, cross-workspace/viewer denial, private tables, service-only receipt lookup and revocation.

## Limits
IDR whole rupiah and whole item quantities only. Browser print dialog offers Save as PDF. Transfer/QRIS is manually recorded, never gateway-confirmed. No stock, refund/correction workflow, offline synchronization, customer records or external printer integration. Catalog/history are paginated (25). Existing shared admin catalog editor does not yet edit Kasir metadata; seed metadata is migration-managed. Configure plan limits centrally before commercial release; no invented pricing/quotas are enabled. Remote migration and real-device production acceptance remain deployment-operator steps.
