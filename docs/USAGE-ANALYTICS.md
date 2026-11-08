# PRCUISA usage analytics

## Definition

An **active user (routine, 7 days)** is a PRCUISA ID that generated at least one `tool_value_completed` event on **two distinct calendar dates in Asia/Jakarta** during the trailing seven days. An **active business (routine, 7 days)** uses the same rule grouped by workspace. Tool opens are counted separately and do not qualify a user as active.

`tool_value_completed` is emitted by successful tool actions. It is not a page-view or login event. Tool-specific analytics should continue to avoid customer names, document content, and other sensitive data.

## Where it appears

- `/admin` → **Analitik**: routine users and businesses (7 days), completed tool actions (7 days), tool opens (30 days), per-tool usage, request status totals (30 days), and a 14-day daily activity series.
- Public `/`: a small aggregate proof line is shown only when at least 10 users meet the routine definition. The public RPC rounds the count down to a multiple of 10 and returns no account, person, or workspace identifiers. If the migration is not installed, data is below threshold, or the service is unavailable, the line is hidden.

## Database rollout

Apply `supabase/migrations/20261014000000_routine_usage_analytics.sql` to the PRCUISA Hub Supabase project after the migrations already deployed there. It adds partial indexes, extends the admin-only snapshot, and grants anonymous users execution of one narrowly scoped aggregate RPC. It does not grant table access to anonymous users.

For a fresh database, use `database/schema.sql`, which includes this migration's final schema. Do not apply this migration to another Supabase project. After applying, verify the `/admin` Analitik tab as a platform admin and `/api/public/routine-usage` as an anonymous request. The public endpoint should return `{ "available": false }` until the 10-user privacy threshold is reached.

## Verification

`node tests/analytics.mjs` validates the activity-day rule, separates tool opens, checks thresholded/identity-free public output, and denies the admin snapshot to a non-admin. The test is included in `npm run test:integration`.
