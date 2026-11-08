# Admin Console & quotation sharing release

## What changed

- Admin Console uses a compact desktop sidebar and a labelled mobile section selector.
- The default overview shows routine activity, tool performance, demand and daily activity. Real analytics require the routine-usage migration already included in the release.
- Admin catalog supports name/purpose search and status filtering. Existing tools, requests, plans and audit actions continue to use the protected admin API.
- Mobile document navigation uses a complete section selector instead of cropped horizontal tabs. Filters have consistent labels, dropdown arrow spacing and 44px+ actions.
- Document dialogs are centered on all viewports and preserve keyboard focus and page scroll state.
- PDF/sharing is an explicit action. Production PDF generation stays authorized on the server. Demo documents can produce actual PDFs clearly marked DEMO.
- The file is prepared before the native Share action. This avoids losing browser user activation after waiting for a PDF fetch.
- On supported devices, the system share sheet attaches the PDF to the selected WhatsApp/email/other app. The user chooses the destination and confirms sending.
- On browsers without file sharing, WhatsApp/email compose actions download the PDF and open a prefilled message. Users must attach the downloaded PDF. A URL scheme cannot attach files automatically; the UI explains this.

## Configuration and boundaries

No additional messaging provider key is required for this device-based sharing workflow. It does not send email from a PRCUISA server or publish invoices publicly. For real private documents, configure PRCUISA Auth, the correct Supabase project, its migrations and entitlements as described in `PRODUCTION-RELEASE.md`. Google Auth, Midtrans, Connect worker/providers each require their documented configuration and separate live validation.

## Verification

- `npm run verify`: typecheck, financial/PDF domain tests, database/security/integration tests and Next.js build.
- `npm run test:ui`: focused Admin, quotation PDF/share and responsive smoke tests. Install Chromium with `npx playwright install chromium` before running. The tests cover 360/390/768/1440px, actual PDF download bytes, native sharing with user activation and cancellation, and attachment fallback explanations.
- PDF tests generate A4 vector PDFs, validate repeatable snapshots, multi-page output and malformed logo failures. The PDF renderer uses standard fonts; unsupported script characters are replaced with `?`.
- Native WhatsApp and email application delivery still needs a final check on actual target devices. Browser tests verify the handoff, not recipient delivery.

### Verified for this release

Typecheck, financial/PDF domain tests, PGlite workspace/security/integration suites and a clean Next.js production build passed. The focused browser suite passed all 16 tests using Chromium 153: Admin navigation/filtering at 360/390/768/1440px, quote creation/issuance, real demo PDF download, native share gesture/cancellation, WhatsApp/email fallback, modal geometry, Connect control spacing, and overflow checks on Hub/QR/Kasir/Connect/document/login routes. Native sharing was mocked to verify the browser handoff; no real customer messages were sent.
