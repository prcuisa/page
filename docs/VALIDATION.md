# PRCUISA Hub v2.0 verification — 7 October 2026

## Verified locally

- Optimized Next.js production build and TypeScript compilation.
- Eight desktop/mobile browser/domain cases pass. Hub starts empty with no fictional records or financial dashboard.
- Search, no-result request guidance, favorite, real recent-tool state, Business Report → Hub → QR Tools → Hub without another login screen in preview.
- Record Rp250.000 income and Rp70.000 expense; accurate Rp180.000 selisih survives in-session tool switching. Invalid zero amount rejected; period/history navigation retained.
- QR output decoded from actual PNG pixels back to the submitted URL; actual PNG download verified.
- Request submission/history/status, activity, clearly unavailable previews, central Free access/paid-package explanation.
- Business onboarding finishes at Hub, with the selected business visible. Reload clears preview data as disclosed.
- Desktop/mobile screenshots inspected; no horizontal overflow. Mobile bottom navigation and large tap targets.
- Public page canonical and semantic H1; private redirects/noindex; reset-password unavailable state; sitemap private exclusions; same-origin mutation rejection.
- Actual migrations tested on PostgreSQL/PGlite: numeric aggregates/idempotency, RLS isolation, anonymous denial, owner/viewer/editor permissions, no self-membership or ownership reassignment.
- Platform tests: no self-upgrade, no registry/status writes, private request/favorite records, revoked membership denial, unavailable tool denial, quota enforcement, second-tool event and financial-insert rollback when entitlement is disabled.

## Not claimed as live-verified

The preview project has no active Supabase configuration. No remote migrations, account data or production DNS were changed. Real signup, email confirmation/reset, same-session authenticated two-tool use, reload persistence and actual hosted RLS require active Supabase and two real test identities. Local SQL + browser preview do not replace that release gate.

Paid gateway/subscription lifecycle, external-subdomain OIDC, integrations, notifications, attachments/votes, automated request grouping, AI tools and production Core Web Vitals remain unimplemented/unverified. Pro/Business are configuration foundations, not purchasable offers. No third-party billing or fake capabilities are exposed.

The screenshot artifacts show the temporary preview, not a production customer account. PRD v2 is the target; full MVP Done requires real user validation (10–20 initial users), repeat value and actual willingness to pay.


## QR editor revision — 8 October 2026

Observed QRcraft reference workflow is now integrated into the Hub tool, preserving identity/workspace boundaries. Additional content tests cover all 10 formats, URL/phone/email/coordinate validation, WiFi escaping, contact/calendar newline escaping and WIB → UTC event times. QR image tests decode actual WhatsApp, WiFi and Unicode content; verify rounded/gradient rendering and logo/H correction; verify PNG/SVG/JPEG/WebP signatures; save and reopen temporary designs; and check mobile overflow. A real Unicode corruption defect in the rendering library was found by decoding and fixed with explicit UTF-8 byte encoding.

Named-save database tests confirm own-user/private-workspace reads, rejected direct inserts, revoked-membership denial and capability checks. Live Supabase persistence is still not claimed. Clipboard has browser-dependent permission/support; unsupported copying displays an error and PNG remains available.

Final QR revision gate: production build passed; 12 desktop/mobile/domain tests passed; database isolation and entitlement tests passed locally.
