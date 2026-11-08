# PRCUISA Hub v2.0

Deployment entry point: [Production release runbook](docs/PRODUCTION-RELEASE.md). GitHub CI and Vercel configuration are included. Production activation remains gated on real backend/provider and browser validation.

An incremental evolution of the existing Next.js/Supabase application: **one PRCUISA ID, practical business tools, one connected ecosystem**. Product source of truth: docs/PRD.md. Historical direction retained in docs/PRD-v1.1-superseded.md.

## What changed

Home is now a tool launcher, not a financial dashboard. Registry-powered tools/search, real recent use/favorites, request submission/history, shared activity and central plan/access surfaces surround three useful tools: existing Business Report, custom QR editor and multi-format download, plus Invoice creation with live totals and workspace-private saving. The same verified Supabase session and selected workspace are used across tools; no second registration.

Business Report retains fast amount entry, integer rupiah, optional category/note/date, period totals, accurate selisih, history and purposeful insights. QR Tools supports 10 content types, custom shapes/colors/gradients, logo, transparent background, size/margin/correction, PNG/SVG/JPEG/WebP export, clipboard and named account designs. Invoice supports sender/recipient details, line items, optional tax/discount, logo, notes, live totals, a print/PDF view and saved invoice history. Its server function recalculates amounts and validates workspace access. See docs/QR-TOOLS.md. QR does not provide dynamic redirects, scanning statistics or payments; Invoice does not collect payment or calculate tax compliance.

`/preview` is an explicitly temporary, in-memory interaction preview. Reload clears records, favorites and requests. Preview request forms never send a real request. `/preview/onboarding` demonstrates business creation. Business Report can load clearly labelled example income/expense entries on request so the dashboard is inspectable without presenting example values as real business data.

## Current operational boundary

The preview deployment has no active Supabase configuration. Real registration, Google OAuth, persistence, email verification/recovery and live workspace isolation still require an active backend and provider configuration. SQL/API code is implemented and tested locally, not remotely applied. This is not a claim that the full production MVP definition of done has been met.

Midtrans Snap checkout, status verification, payment history and an idempotent server-side membership update are implemented. Paid checkout remains disabled until merchant credentials and approved plan prices are configured. Pro/Business prices are deliberately unset. External-domain SSO, team invitation UI, AI, notifications and integrations are not active. Existing transaction history remains append-only. No main-domain or DNS changes were made.

## Run

Node >=22 (preview uses Node 24), then `npm ci`, `npm run build`, `npm run start`. For development: `npm run dev`. Configure values from .env.example; never commit real secrets.

- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: selected active project, publishable/anon key only.
- NEXT_PUBLIC_APP_URL: actual app origin. NEXT_PUBLIC_SITE_URL: canonical public origin.
- INDEX_PUBLIC_CONTENT=false on app/preview deployments; true only on the canonical public acquisition deployment.
- Google OAuth: enable Google in Supabase Auth, register the Google Cloud web client, and allow `https://<supabase-project-ref>.supabase.co/auth/v1/callback` in Google's OAuth redirect URIs. In Supabase URL Configuration allow `https://<app-host>/auth/callback` (and your local callback for development). The OAuth client secret is stored in Supabase Auth settings, not the app.
- Midtrans: set server-only `MIDTRANS_SERVER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `MIDTRANS_IS_PRODUCTION` in the deployment environment. The payment notification URL is `https://<app-host>/api/billing/midtrans/webhook`. Apply the Midtrans migration and set the approved `pro`/`business` `amount_idr`, `period_days`, and `active=true` values in `public.billing_plans` before opening checkout. Do not put the Midtrans Server Key or Supabase service role key in a `NEXT_PUBLIC_` variable.

Privileged service credentials are used only by the payment webhook route to apply verified payments; never expose them to the browser. Authenticated Supabase clients plus RLS and tightly scoped RPCs protect user and workspace data.

## Database setup and upgrade

For a new database apply all `supabase/migrations/*.sql` in timestamp order, or database/schema.sql once. For a v1.1 installation apply the ecosystem, QR, Midtrans, then Invoice migration. For an existing v2 installation apply the QR migration, `20261008120000_midtrans_billing.sql`, then `20261008153000_invoice_tool.sql`. These migrations are additive and preserve existing workspaces, memberships and financial records. Do not rerun the consolidated schema over an existing database.

Production registry lives in public.apps; preview catalog comes from src/lib/app-registry.json, which supplies the identical migration seed. Add a working adapter and authorization/analytics tests before marking a new tool active. Do not enable arbitrary launch URLs.

Plans/capabilities/subscriptions are administrator-controlled. Capability quotas are checked in the API/database, including a transaction-insert trigger so bypassing the UI cannot bypass financial-write entitlements. Usage is per identity across business contexts. Supplied limits are null until validated; abuse protection is separate (60 events/minute/user). Functions fix search_path and validate both auth.uid and membership.

Requests are private to their submitting identity and workspace. Operators can review/group demand with database/request-review.sql. End users cannot change status, plans, access rules or usage counters. Grouping is a manual foundation, not a fake AI process.

## Routes

Public: /, /products, /products/business-report, /products/qr-tools, /products/invoice, /login, /signup, /reset-password.
Private: /dashboard, /tools, /tools/business-report, /tools/qr, /tools/invoice, /requests, /activity, /settings, /settings/billing, /settings/integrations.
Legacy /apps and /apps/business-report remain compatible. /auth/callback and /update-password retain identity recovery behavior.

Public /products URLs preserve canonical continuity; protected /tools routes are excluded from indexing. A future separated main-domain deployment can use /tools landing URLs deliberately. Current public pages have distinct metadata, canonical/Open Graph, semantic content, truthful schema and a maintained public-only sitemap.

## Verification

`npm run typecheck`, `npm run build`, `npm run test:security`, `npm test`.
Playwright uses desktop and iPhone-sized Chromium. Optional BROWSER_EXECUTABLE_PATH selects an installed browser. Tests decode the actual QR pixels, download PNG, exercise retained financial records, favorites, requests, onboarding, private-route redirects and noindex. PGlite tests run the actual SQL under separate identities, viewer/editor roles, capability denial, quotas, request privacy and membership escalation attempts.

Live release gate: configure Supabase redirect URLs and email delivery; create two real test accounts; verify confirmation/reset, workspace persistence, Tool A → Hub → Tool B with one session, requests/favorites after reload, server capability/usage limits and cross-tenant denial through the actual Supabase API. Test on a real phone. Only then consider app.prcuisa.com production rollout.

See docs/PLATFORM-CONTRACT.md and docs/VALIDATION.md. Ecosystem metrics: database/ecosystem-analytics.sql. Prior transaction analytics remain tool-specific in database/analytics.sql.

Provider setup notes: docs/AUTH-BILLING-SETUP.md.

Direct QR editor preview: `/preview/qr`. Reference feature audit, encoding, privacy and save/export rules are in docs/QR-TOOLS.md.

Invoice & Quotation tool routes: `/tools/invoice-quotation` and its quotation, invoice, customer, item, and settings subroutes. Apply the migrations listed in `docs/INVOICE-QUOTATION-DELIVERY.md` before enabling authenticated usage. The earlier `/tools/invoice` route remains available for existing documents.
