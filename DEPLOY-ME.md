# PRCUISA Hub — deploy package

## Start here

1. Use Node.js 24 and install the locked dependencies: `npm ci`.
2. Create a dedicated Supabase project for PRCUISA Hub. For a fresh database, apply `database/schema.sql` once. For an existing Hub database, apply only migrations newer than its migration history. Never run the complete schema over an existing database.
3. Fill the variables listed in `.env.example` in Vercel. Follow `docs/PRODUCTION-RELEASE.md` for required variables and optional Google/Firebase, Midtrans and Connect configuration. Keep all secrets server-side.
4. Configure PRCUISA Auth redirect URLs for the final domain and validate signup, Google login, logout and password reset.
5. Provision your admin account by inserting its authenticated user UUID into `platform_admins` through an authorized database administrator. End users cannot grant themselves admin access.
6. Run `npm run verify`. Run `npm run test:ui` on a machine with Chromium. For production settings, run `npm run check:env -- --strict`.
7. Push this source to `Prcuisa/prcuisa-hub` or import it into Vercel. Framework: Next.js. Install: `npm ci`. Build: `npm run build:vercel`. Node: 24.x.
8. Run a staging smoke test, including cross-workspace denial, quotation issuance, PDF download/share, Midtrans sandbox callback and enabled Connect adapters. Configure live providers before enabling their production features.

## Included

Source, lockfile, migrations/RLS, tests, environment template, GitHub CI and provider/worker deployment guides. No credentials, generated build folders or installed dependencies are included.

## Important release details

Read `docs/ADMIN-SHARING-RELEASE.md` for this update. Native PDF sharing uses the device share menu. WhatsApp/email fallback opens a prefilled message and requires manually attaching the downloaded PDF. Server-side automatic email sending is not included in this update.

Preview is a staging deployment. This archive is deployable source with required configuration; it is not a preconfigured live production environment.
