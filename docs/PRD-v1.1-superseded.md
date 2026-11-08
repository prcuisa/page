# PRCUISA Hub — Product & Design PRD v1.1

Updated 7 October 2026. Consolidates the original MVP PRD with the focused customer-direction update. This document supersedes conflicting product copy and scope decisions in v1. Existing architecture, account model, security, brand, and SEO foundations are retained.

## Product promise

**Catat bisnis hari ini. PRCUISA bantu kamu memahami hasilnya.**

Pemasukan, pengeluaran, dan kondisi bisnis dalam satu tempat sederhana.

Progression: **Catat → Pahami → Otomatiskan** (Capture → Understand → Automate).

The broader PRCUISA brand remains Business Systems · AI Automation · Smart Technology. Corporate vision does not broaden the MVP audience or feature scope.

## First customer and job

An Indonesian small-business owner/operator who still relies on WhatsApp, Notes, spreadsheets, paper, or memory. They operate on smartphones, often one-handed while serving customers, packing orders, working in a workshop, or running a farm. They have no IT team, are not accounting experts, and want clarity rather than software complexity.

Examples: warung, small F&B, toko, online sellers, peternakan, bengkel/workshops, service businesses, creators, small offices, and micro businesses with small teams. Do not position the MVP as software for all businesses.

Primary job: “Ketika bisnis saya berjalan setiap hari, saya ingin mencatat pemasukan dan pengeluaran dengan cepat supaya saya tahu kondisi bisnis tanpa harus menghitung atau membuat laporan secara manual.”

Secondary job: notice meaningful patterns once enough data exists. Future job: reduce repeated manual work through automation.

Answer first: berapa uang masuk, berapa keluar, bagaimana hasil hari ini, pengeluaran terbesar untuk apa? Weekly comparisons and deeper understanding follow sufficient data and validated development.

## Boundaries and product principles

Current validated stage is daily recording and simple summaries. Build reusable systems; keep technology invisible; use AI only where it explains data or removes work. Prioritize action and a useful next step over decorative charts.

Do not build ERP, tax software, an accounting ledger, POS, inventory, HRIS, complex CRM, a workflow builder, native mobile apps, or multiple agents. Do not claim formal bookkeeping or accounting compliance. **Selisih Pemasukan & Pengeluaran** is the arithmetic difference between recorded cash amounts, not accounting profit.

Before adding a feature: does it make recording easier, clarify the business, encourage useful repeat use, remove manual work, or create value users might pay for? Otherwise defer it.

## Identity, business, and architecture

One PRCUISA ID → Business/Workspace → Apps → Automation/AI/Integrations. Internally keep workspace identifiers and ownership; externally say **Bisnis**, **Buat Bisnis**, **Nama Bisnis**. No separate accounts per app.

All operational data belongs to a workspace. Preserve future multi-workspace extensibility. Existing owner/viewer/editor access and RLS isolation remain mandatory. Membership management stays out of the initial UI.

Keep Next.js, TypeScript, Tailwind, Lucide, Supabase, and Vercel. Future providers remain modular; n8n and AI infrastructure are not user-facing terminology. This revision adds to existing source and database migrations, never resets user data or rebuilds unrelated architecture.

## Defaults and language

Bahasa Indonesia, IDR, Asia/Jakarta. Language, currency, and timezone remain distinct concepts for future expansion. Current supported currency/timezone constraints are explicit, not imaginary localization support.

Use Pemasukan, Pengeluaran, Selisih, Ringkasan Bisnis, Insight Bisnis, Perkembangan Bisnis. Avoid API, analytics, AI infrastructure, and workspace jargon in operational screens.

Personality: calm, clear, competent, practical, trustworthy. No excessive celebrations, emojis, artificial gamification, or chatbot theatrics.

## Screens and navigation

Public: landing/entry and Business Report product page. Authentication: register, login, reset password, choose new password. Onboarding: create business. Product: Hari Ini, quick input, Riwayat, Laporan, profile/business settings. Apps is secondary through settings, not a prominent daily navigation tab.

Desktop retains the compact sidebar and workspace/account top bar. Mobile uses comfortable bottom navigation. No horizontal scrolling, desktop-only actions, or excessive nested navigation.

## Short onboarding

1. Welcome and “Apa nama bisnis kamu?” shown together; name is required, business type has a sensible optional default.
2. “Apa yang paling ingin kamu rapikan?” with Pemasukan & pengeluaran / Laporan bisnis / Pekerjaan berulang / Customer service / Belum tahu, saya mau coba dulu. Default to the last option; no mandatory typing. Explain that today's active capability is recording, regardless of selected interest.
3. “Bisnis kamu siap.” CTA **Mulai Catat Hari Ini** opens the income sheet directly.

Target under 3 minutes, ideally much faster. Welcome is not an extra click-through screen. No onboarding questionnaire beyond these useful choices.

## Daily operational flow

Open → Catat → Lihat hasil → Pahami → Tutup → Kembali besok.

Mobile hierarchy:

1. Business name.
2. **Hari Ini** with Pemasukan, Pengeluaran, Selisih.
3. **+ Pemasukan**, **+ Pengeluaran**.
4. **Insight Bisnis**.
5. At most one contextual next-value preview, where warranted.
6. **Aktivitas Terbaru**.

Dashboard is always today in Jakarta. Period switching belongs in Laporan. Preserve the existing month report; new 7/30-day trends remain roadmap items.

New business: no cold grid of Rp0. Say “Selamat datang di PRCUISA”, “Mulai dari aktivitas bisnis hari ini”, “Catat pemasukan atau pengeluaran pertama kamu.” Actions: Catat Pemasukan / Catat Pengeluaran. Supporting habit copy: “Semakin rutin kamu mencatat, semakin jelas PRCUISA dapat membantu kamu memahami kondisi bisnis.” Do not show future-feature promotions before any record exists. Existing businesses with no records today get a period-specific empty state, not a misleading new-business welcome.

## Less-than-10-second entry

Open a quick sheet → “Berapa pemasukan?” / “Berapa pengeluaran?” → numeric IDR amount → **Simpan Pemasukan** / **Simpan Pengeluaran**.

Amount is the only required input in the normal flow. Category, note, and date live under a collapsed optional-details control; date defaults to today. Store full integer rupiah and validate on client, server, and database. Reuse the transaction ID on retry to prevent duplicates. After successful persistence: close the sheet, refresh totals, and confirm the amount, e.g. “Pemasukan Rp250.000 berhasil dicatat.”

No forced page transitions or mandatory category selection. Targets comfortably support touch and one-handed use. Preserve errors and user input if saving fails. Never imply an unsaved record succeeded.

## Insight and progressive intelligence

Day 1: grounded arithmetic and current category summaries. Subsequent stages: comparisons, trends, categories; then patterns/anomalies/recommendations; later automation. Data → Context → Insight → Automation.

Current Insight Bisnis is deterministic. One real expense is sufficient to identify the largest category among recorded expenses; explain the scope. Do not claim statistical patterns from a handful of same-day records. No arbitrary “3 more records unlock AI” copy. Do not treat absent records as proof of zero business activity, or invent causal explanations.

Examples such as “18% above the last 7-day average” may only be used after the calculation, coverage, and comparison period are supported. No canned or fabricated percentages, ratings, clients, or production metrics.

## Progressive Product Reveal

Show today's value and the next useful capability. One subtle contextual preview after Insight Bisnis and before recent activity. Badge **Segera Hadir**, small icon, quiet teal tint/dashed border, concise benefit, optional **Lihat Preview**. Never a giant roadmap banner, disabled unexplained button, or aggressive upsell.

Selection is based on actual all-business history, not paginated rows or the selected report range. Future-dated records do not advance reveal eligibility. The following initial rules choose editorial relevance only; they do not unlock functionality or promise statistical validity:

| Evidence (evaluate most mature rule first) | One preview |
| --- | --- |
| 0 actual records | None; focus on first record |
| 1–2 records | Tutup Hari |
| 3+ records, below later conditions | Insight Bisnis lebih mendalam |
| 3+ distinct active dates | Perkembangan Bisnis |
| 20+ records dated in the latest 7 days | Catat lewat WhatsApp / Telegram |
| 7+ active dates and 40+ records | Ringkasan harian otomatis |
| 14+ active dates and 60+ records | Tanya tentang bisnis kamu |
| 30+ active dates and 120+ records | Pekerjaan rutin berjalan otomatis |

These rules are transparent implementation defaults to evaluate with customers, not a gamification scheme. No counters toward thresholds appear in the UI. No launch dates are invented.

**Tutup Hari preview:** read-only, uses actual today's aggregate data: total income, total expense, difference, count, largest income, largest expense. Clearly states it does not close the day, save a report, or schedule delivery. The feature remains unavailable.

Other previews explain the future benefit without fabricated charts or functional-looking inputs. A chat example such as “keluar 150rb beli bahan” is labelled as an example and never inserted as a transaction. Business Assistant may show an example question but never invent a generated answer.

## Internal roadmap — not primary navigation

1. Catat: income/expense loop (active).
2. Pahami hari ini: Tutup Hari / daily summary (first major next feature).
3. Pahami perkembangan: 7/30-day summaries, category breakdown, comparisons, trends.
4. Insight: grounded patterns, anomalies, useful recommendations.
5. Catat tanpa buka app: WhatsApp/Telegram with confirmation of parsed records.
6. Automatic daily/weekly reports and meaningful alerts.
7. Business assistant answering actual business-data questions.
8. Automation for validated repeat operations.

Business Report remains the active app. AI Agent, Automation, QR Tools may appear quietly as Segera Hadir in the secondary directory. Invoice/CRM and other apps are possibilities only after validation. **Show the future. Build the present.**

## Design and accessibility

Preserve #009AA5 teal and #434242 graphite, white/warm white/light neutrals/subtle teal surfaces. Space Grotesk for brand/headings; Inter for UI/numbers. Calm, clean, functional, premium, trustworthy. Restrained 10–16px radii, soft borders, minimal shadows. Clear hierarchy over cards everywhere.

No purple gradients, neon/glow, decorative blobs, random sparkles, robot-led hero, invented charts, or unnecessary animation. Keyboard focus, semantic controls, labels, adequate contrast, native accessible dialogs, focus restoration, numeric keyboards, reduced-motion support. Every async workflow has loading, success, error and empty states. Errors use ordinary language.

## Security and data integrity

Authenticate protected screens and API actions; verify identity, never trust editable metadata for authorization. Enforce workspace authorization via RLS on every data-access path and aggregate function. Invoker-security functions must not bypass RLS. No privileged keys in browser code. Preserve cookie refresh, no-store private responses, same-origin writes, validation, and idempotent inserts.

Password recovery uses Supabase PKCE email link exchange, an allowlisted internal callback destination, authenticated password update, and sign-out after change. Missing configuration fails closed. Never fabricate a successful email send in preview. Real SMTP/email/session tests remain a production gate.

Schema changes are additive. Existing installations apply only the new migration; new projects apply both in order. Do not execute the consolidated schema on an existing database.

## SEO and discovery

Keep prcuisa.com as the canonical public acquisition surface; app.prcuisa.com for authenticated product. Do not replace the main domain during this preview revision. Public copy addresses pencatatan usaha, pemasukan/pengeluaran usaha, laporan harian sederhana, understanding today's business, and reducing manual work naturally.

Search problem → useful content → understand solution → try PRCUISA → create business → first activity → value. Measure qualified activation, not page views.

Preserve server-renderable content, unique titles/descriptions, one H1, semantic headings, canonical URLs, contextual internal links, OG/social metadata, accurate structured data, optimized local fonts, restrained JS and stable layout. Schema reflects actual visible content only. No fake ratings/reviews/prices or thin programmatic pages.

Canonical public deployment may enable INDEX_PUBLIC_CONTENT=true. Review builds default to noindex and an empty sitemap. Private routes always remain noindex and excluded from sitemap, regardless of public indexing. robots.txt is not a security mechanism. Future products, solutions, guides and docs should be added only with distinct value, real expertise, clear authorship, and deliberate internal links. Localization remains future architecture, not duplicate thin pages.

Target strong real-world Core Web Vitals; measure field performance after launch rather than claim scores from an untested release.

## Product measures

Primary: **Weekly Active Business** = distinct businesses with at least one successfully persisted transaction created during a Jakarta calendar week. Merely opening a screen is not an active business for this metric.

Supporting: First Record Rate (created businesses with a first record), Time to First Value (business creation to first successful record), Records per Active Business, Week 1 Retention (activation cohort returning to record in the following Jakarta calendar week), Repeat Recording Rate (businesses recording on at least two distinct dates in the observation period). Define windows before comparing cohorts; exclude preview/test traffic. Later: paid conversion after billing exists.

Existing event history remains intact. Do not add premature billing or upgrade calls to the operational interface.

## Release acceptance

On a phone, while running a business and with under one minute available: understand Hari Ini, record Rp250.000 income, see the amount and updated result, understand one relevant next value, leave without instructions.

Verify blank-state guidance, nominal-only input, optional fields, errors, no duplicates on retry, current-date boundaries, backdated history, one/no contextual preview, real preview numbers, modal focus, no horizontal overflow, short onboarding, recovery states, public SEO, private noindex, anonymous and cross-workspace denial.

A passing local preview is not a production backend launch. Live release still requires an active Supabase project, migrations, two-account authorization tests, email/session/recovery validation, and deliberate domain configuration.
