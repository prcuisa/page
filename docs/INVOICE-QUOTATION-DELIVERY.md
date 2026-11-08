# PRCUISA Invoice & Quotation — Delivery Notes

## Architecture assessment

The existing Hub already provides Supabase Auth, workspace ownership/membership, an app registry, capability entitlements, usage events, Midtrans plan billing, and a shared application shell. This tool reuses those platform boundaries. It adds the `invoice-quotation` registry entry and keeps the earlier `/tools/invoice` implementation and records intact during transition.

The new module lives in `src/features/invoice-quotation`. The browser calls authenticated `/api/iq` endpoints; PostgreSQL security-definer domain functions validate membership, role, entitlement, workspace relationships, input, numbering and totals. No service role credential is used by the browser. The tables allow authorized workspace reads and expose no direct writes. The PDF route reads an issued document through an authorized database function, renders vector text server-side with `pdf-lib`, then records successful PDF usage.

## Implemented workflow

- Business-specific document profile, logo, prefixes, default validity and payment notes.
- Customer and product/service catalog creation, editing, search and archival.
- Quotation and direct invoice drafts with mobile line-item editor, optional document/line discount and optional generic tax.
- Server-side `NUMERIC` recalculation and explicit whole-rupiah rounding at line, discount and tax boundaries.
- Official `QT-YYYY-0001` / `INV-YYYY-0001` allocation only on issue. A transaction-safe per-workspace lock and sequence table prevent number reuse and concurrent duplicates.
- Issued snapshots, optimistic draft version checks, recorded manual quotation decisions, accepted-quotation conversion, and a unique primary invoice per quotation.
- Manual partial/full payment, idempotency keys, overpayment guard, audited payment reversal, and derived paid/partial/overdue status.
- A4 multipage vector PDF with page numbers, WhatsApp native file sharing when supported, and a clear download-plus-attach fallback.
- Paginated lists, filters, detail routes, empty/loading/error feedback and an in-memory demo mode marked as a simulation.

## Migrations and local verification

Apply these migrations in order with the project's normal Supabase migration pipeline:

1. `20261008153001_platform_foundation.sql`
2. `20261008153002_invoice_quotation.sql`
3. `20261008153003_iq_pdf_access.sql`

`database/schema.sql` is regenerated from all ordered migration files for the local PGlite security harness. It is not a substitute for applying production migrations through Supabase.

Useful checks:

```sh
npm run typecheck
node --experimental-strip-types tests/iq-domain.mjs
npm run test:security
npm run build -- --webpack
```

The current security harness covers workspace boundaries, viewer write denial, server totals, issuance numbering/idempotency, snapshots, conversion, manual payments, PDF authorization/metering, votes, identity-bound invitations, and protected/audited administration.

## Admin setup

Platform-admin access is intentionally not granted from a profile field or a public API. After verifying the operator's Supabase Auth user ID, a trusted database operator can provision it in Supabase SQL Editor:

```sql
insert into public.platform_admins(user_id)
values ('<verified-auth-user-uuid>')
on conflict do nothing;
```

The new `/admin` page redirects non-admins. Every admin mutation is checked in SQL and written to `admin_audit_events`.

## Environment and launch checklist

This work adds no new environment variables. Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are required for the Hub; existing Midtrans variables and webhook verification remain centralized in the existing billing service. Google login also uses the existing Supabase Auth provider/callback configuration. Configure secrets in the target deployment environment, never in source or client code.

Before enabling the authenticated preview for users:

- Apply all migrations to the preview Supabase project.
- Verify Google OAuth redirect URLs for the preview hostname.
- Provision the intended platform operator in `platform_admins`.
- Confirm the plan entitlement rows and quotas in `plan_entitlements`. Proposed Free/Pro/Business amounts and document limits remain configurable hypotheses; this implementation does not invent commercial limits and defaults the new document quotas to unmetered (`NULL`).
- Run an authenticated owner/editor/viewer workflow, including a second workspace and denial checks.
- Verify one issued PDF on desktop and mobile, including a multi-page document and an uploaded logo.
- Configure Midtrans only through the existing central billing settings and verify its webhook in the intended environment.

## Known limitations / not claimed as live

- No migrations were applied to a remote Supabase project in this workspace session. Authenticated use remains dependent on applying them first.
- Supabase Auth remains the Hub identity provider. Standards-based OAuth/OIDC SSO for independently deployed product subdomains is a separate platform task; this code does not copy cookies between domains.
- Workspace invitations are accepted by a verified matching PRCUISA ID, but no invitation email is sent automatically. Owners must share the invitation page through their own channel.
- The demo preview keeps data only in current page memory, assigns `DEMO-` document labels, and does not generate official PDFs or persist demo information.
- PDF output uses standard PDF Helvetica fonts, which render reliably without remote fonts. Unsupported Unicode glyphs are replaced with `?`; the first template is intentionally a clean business document, not a tax invoice. There is no public document link, email delivery, e-signature, automatic settlement verification, tax filing, multiple currency support, or recurring billing.
- Browser-driven desktop/mobile E2E could not be run in this execution sandbox because binding the test server port returned `EPERM`. Database security tests, unit tests, type checking, and the production build are run separately.
