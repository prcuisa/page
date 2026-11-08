# QR Tools custom editor — 8 October 2026

Feature reference inspected directly: https://qr.prcuisa.com/ (QRcraft). This revision brings the observed content/style/export workflow into PRCUISA Hub. It does not change that separate site's account, subscription, saved records or deployment.

## Available editor features

- URL, plain text, email (subject/body), telephone, SMS, WhatsApp (message), WiFi (WPA/WEP/open/hidden), vCard, geo location, and calendar event.
- Quick presets: Klasik, Bulat, Titik, Neon, Sunset, Mono. Six pixel shapes, three outer-corner shapes, two inner-corner shapes.
- Solid/linear/radial gradient, gradient rotation, foreground/background colors, transparent background.
- Raster logo upload (PNG/JPEG/WebP <=2 MB, resized locally), adjustable logo size, automatic H correction with logos.
- 256–2048px output, margin, L/M/Q/H error correction, automatic preview.
- PNG, SVG, JPEG, WebP downloads; copy PNG to clipboard where the browser supports it. JPEG flattens transparency to the selected background.
- Save named design, list own workspace designs, reopen for reuse. Re-saving creates a new record and never silently overwrites an earlier design.

The existing Hub capability `qr` remains the access boundary. No new independent registration, QRcraft paywall, pricing or trial is copied. Pro/Business payment is still unconfigured. Preview supports all editor features, and only temporary session saves.

## Data and security

Content is encoded locally. Download authorization/metering sends only workspace and action, never WiFi passwords, contact details or logo data. Only explicit Save sends the relevant content fields/style/logo to the authenticated account API. The interface explains this, and warns that WiFi QR includes a password. Switching types does not save unrelated fields; no-password WiFi excludes a previous password.

`qr_designs` is separate tool-domain data. RLS permits only the submitting identity with current membership of the workspace. No direct authenticated insert/update/delete grant exists. `save_qr_design` fixes search_path, derives auth.uid(), and calls the centralized membership/capability/rate/quota check before an atomic insert. Ordinary clients cannot choose another owner or bypass a disabled capability. API validates input size, format and content. Saved listing sends names/types, not all private content/logos; full validated design loads only on demand. The initial list is the latest 100 records.

Static QR is not an access-controlled secret: anyone with the QR image can read its content. It is not dynamic QR, payment QRIS, a hosted redirect, or scan analytics. Saving a modified design does not change previously downloaded QR codes.

URL content rejects non-http(s) schemes and embedded credentials. Contact/calendar fields escape line breaks and delimiters; WiFi fields escape separators. Event inputs are explicitly WIB and serialized UTC. Invalid coordinates, phone/email formats, date ranges and oversized content are rejected. Unsupported clipboard/export operations show an honest error.

`qr-code-styling` is pinned to 1.9.2. Its bundled encoder uses low bytes; the renderer supplies UTF-8 bytes explicitly in Byte mode. The regression suite decodes non-ASCII QR text so upgrades cannot silently corrupt accents/emoji.

## Migration and rollout

Apply only `supabase/migrations/20261008021523_qr_designs.sql` after the existing v2 platform migrations. A new installation can apply all timestamped migrations, or database/schema.sql once. No remote database is changed by this preview revision.

Direct interactive preview: /preview/qr. Private tool: /tools/qr. Same selected workspace and Supabase session as other Hub tools.

Each authorized export or named save consumes one completed QR action when a monthly limit is configured. Live preview rendering is local and unmetered. A failed browser download or clipboard operation after authorization may still consume that authorization; this is not a paid charge. Paid quotas and billing remain unconfigured.

Live account persistence still needs active Supabase and actual two-account verification. Local SQL tests verify boundaries; temporary preview saves do not prove live persistence.
