# Production release runbook

## Actual status

This repository is packaged for GitHub and Vercel. It is **not yet certified production-ready**. No production database migrations, live identity/provider validation, VPS worker deployment or production release have been performed by this packaging task. Existing preview is separate from production.

## GitHub

1. Extract the archive as a repository root, including `.github`, `.gitignore`, `.nvmrc` and `.env.example`.
2. Create a private GitHub repository under the intended owner. No GitHub destination has been supplied; this package has not been pushed.
3. Use Node 24 and `npm ci --include=dev`.
4. Run `npm run verify`. The workflow additionally installs Chromium and runs the release smoke checks at phone, tablet and desktop widths.
5. Push a release branch and open a PR. Require the `verify` job and review before merging to main. Do not add provider secrets to GitHub for these tests.
6. Review dependency vulnerabilities using `npm audit` in a network-enabled trusted environment. Resolve applicable findings before release.

## Vercel

1. Import the GitHub repository into a **new production project**; retain `prcuisa-hub-mvp-preview` for preview testing.
2. Select Next.js and Node 24. Remove the old archive-extraction install command if reusing a manually deployed project. The repository's `vercel.json` uses `npm ci --include=dev` and `npm run build:vercel`.
3. Configure environment values from `.env.example` separately for Preview and Production. Never use production customer data in previews.
4. Set `NEXT_PUBLIC_APP_URL=https://app.prcuisa.com` and `INDEX_PUBLIC_CONTENT=false` for the private Hub. Use the selected real Supabase project URL/publishable key and server-only service role key.
5. Production build validates required configuration and incomplete provider groups. This validates configuration shape only, not credential validity or live authorization.
6. Deploy a preview first. Do not assign app.prcuisa.com or promote until the live release gates below pass and the owner approves production activation.

## Database and identity

- Confirm the actual Hub project before changing a database. The previously accessible family-finance project is unrelated and must not be modified.
- Back up the target database, verify restore access and inspect migration history.
- Apply missing `supabase/migrations/*.sql` in timestamp order using the Supabase migration workflow. Never run `database/schema.sql` over an existing installation. The consolidated schema is for a fresh database/local tests only.
- Configure email confirmation/recovery delivery and allowed app callback URLs. Configure Google/Firebase and Supabase identity federation as documented in AUTH-BILLING-SETUP.md; no second user store or copied cookies.
- Test two real accounts in different workspaces: sign in, verify email, reset password, save/reload records, revoke membership and attempt cross-workspace access through the API.

## Billing and Connect

- Keep Midtrans disabled until approved plan pricing, merchant production configuration and notification callback verification are complete. Test sandbox payments separately; verify server-side settlement, duplicate callbacks and cancellation before activating live checkout.
- Read CONNECT-CHANNELS.md and the worker compose files. Connect requires a persistent worker outside Vercel, encrypted destination storage, identical encryption keys in web/worker environments, verified consent and real provider credentials.
- Run actual opted-in tests for each enabled channel, retry/failure, disconnect and revoked membership. Do not advertise a channel as launched until these pass.
- WAHA requires a pinned image, persistent session volume, private administrative access, TLS proxy and monitoring. Vercel does not host its session or persistent worker.
- Connect quiet hours, fully independent per-channel schedules, full delivery pagination, email bounce callbacks and operator recovery UI remain incomplete. Full PRD completion is not asserted.

## Release gates and rollback

- CI passes, dependency audit reviewed, real mobile/tablet/desktop visual and keyboard testing completed.
- Database migrations and RLS checked on the real staging project. Private pages remain noindex and unauthorized requests are denied.
- Exercise invoice issuance/number uniqueness, payment retries, QR exports, Kasir checkout and receipt access, and Connect authorization with real staging accounts.
- Configure application error reporting, worker health/queue-age alerts, backups, retention and provider-spend monitoring. Confirm an operator owns incident response.
- Capture the prior deployment ID and database backup before release. Roll back application deployment through Vercel if required. Stop worker for queue incidents; do not delete pending deliveries or reverse schema with destructive SQL. Use a reviewed forward-fix migration; never restore a backup over newer customer writes without a recovery plan.

## Known verification boundary

Local SQL tests use PGlite and do not replace real Supabase Auth/PostgREST/RLS integration tests. Chromium installation in this workspace failed, so browser smoke tests are supplied for CI but have not passed locally. No lint command is claimed; TypeScript, SQL/domain/security tests and Next production compilation are the available local gates.
