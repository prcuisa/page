# PRCUISA Hub — Master PRD v2.0

Product direction / build source of truth · 7 October 2026
Parent: PRCUISA · Product: app.prcuisa.com · Indonesia first, globally extensible

This document supersedes the Business Report-centric global direction in v1.1. Preserve the existing application, branding, identity, workspace isolation, security and public SEO foundations. Business Report remains a tool; it is no longer the identity or homepage of Hub. This document states product requirements, not a claim that all phases are shipped. See VALIDATION.md for actual availability.

## 1. Vision and positioning

PRCUISA builds smarter systems that keep working: Business Systems · AI Automation · Smart Technology. Hub is the home for a growing ecosystem of practical business tools.

**One PRCUISA ID → One Subscription → Many Business Tools.**

One account. Smarter tools. Better business.
One PRCUISA ID. Access the tools your business needs.
One subscription. The PRCUISA ecosystem.

Do not position PRCUISA as accounting software, ERP, a chatbot, a workflow builder, dashboard software, random utilities, or generic all-in-one SaaS. Each tool solves a useful task; Hub connects discovery and access. More business needs should make one established PRCUISA ID more useful.

## 2. Four layers

- PRCUISA ID: identity and access.
- PRCUISA Hub: discovery and control center.
- PRCUISA Membership: subscription and entitlements.
- PRCUISA Tools: business systems, AI, automation, utilities, future validated products.

Keep these conceptually separate. Do not create independent accounts, profiles, billing, or product silos without a compelling reason.

## 3. Identity and one-login contract

One verified identity follows the user between eligible first-party products. Profile includes name, email, avatar, preferences and security. Access includes plan, capabilities and usage. Tools include recent, favorites, enabled apps and settings. Integrations and billing are centralized.

Tools may run inside Hub or at dedicated PRCUISA subdomains. Independently deployed tools must use standards-based authentication with explicit issuer/audience/session validation. Never copy browser tokens across domains as an SSO shortcut. A shared in-Hub session validates the first two integrated tools; external SSO is a later integration, not implied by a link.

Protected flow: verified identity → authorized session → subscription/capabilities → authorized workspace → tool. User-editable profile metadata must never grant access.

## 4. Business/workspace

PRCUISA ID represents a person; workspace represents business/project context. A user can own or be explicitly invited to multiple contexts. Core fields: ID, owner, name, slug, business type, timezone, currency, timestamps. Preserve ownership and existing operational records.

Default language id, currency IDR, timezone Asia/Jakarta. Currency/timezone are independent from language; architecture remains extensible. User-facing terminology: Bisnis, Nama Bisnis, Buat Bisnis. Membership cannot be self-assigned by knowing an identifier.

## 5. Hub responsibilities and navigation

Hub handles identity entry, workspace selection, discovery, launch, recent tools, favorites, appropriate recommendations, announcements/previews, requests, activity, settings, access, integrations and billing. Specialized work stays inside tools.

Desktop: Home, Tools, Requests, Activity; Settings at bottom. Mobile: Home, Tools, Activity, Account, with requests available prominently in context. Avoid excessive levels or individual tools becoming top-level navigation.

Home answers “What can PRCUISA help me do right now?”

Hierarchy: greeting → search → continue using → your/favorite tools → useful recommendations → genuine new releases → one relevant preview → request a tool → subscription/access. Omit empty/redundant sections. Never place Business Report totals on global Home or fabricate recent use.

## 6. Discovery and registry

/tools is the private ecosystem catalog. Search matches registered tools by name, description and actual intent keywords. A query with no available solution offers a request instead of a fake tool. Natural-language AI discovery can follow later.

Authoritative registry fields: slug/ID, name, description, category, icon, launch destination, status, access type, minimum plan, featured/public flags, timestamps. Production UI loads it from the database; preview uses the matching seed catalog. Add categories only when actual products justify them.

Statuses: active, beta, coming_soon, deprecated, private. Access types: free, included, limited, business, internal. Unavailable tools open an explicitly informational preview. No inactive launch controls without explanation. Never launch an arbitrary untrusted URL just because it was supplied by a client.

## 7. Common tool contract

A tool supports verified PRCUISA ID, authorized workspace context, centralized entitlements, metering where applicable, important activity, return to Hub, shared design conventions, safe errors, analytics and centralized subscription. Shared data requires least privilege, explicit purpose and user expectation; being in the same ecosystem grants no automatic access to all business data.

Do not prematurely create universal customer/product/document/transaction mega-tables. Each tool owns its domain model. Define shared objects only when multiple useful tools need them.

## 8. Initial useful tools

Business Report: amount-first revenue/expense capture, immediate accurate totals, period summaries and activity. Bahasa Indonesia, fast numeric entry, empty-state guidance, optional category/note/date. Use Selisih Pemasukan & Pengeluaran, never accounting-grade profit. Retain the record → understand → repeat loop within the tool.

QR Tools (8 October update, user-directed reference parity): URL, text, email, phone, SMS, WhatsApp, WiFi, vCard, location and event content; shape/color/gradient/logo customization; size/margin/error correction; automatic preview; PNG/SVG/JPEG/WebP and clipboard export; named private account designs. No dynamic redirects, scan analytics, QR payments, or fake tracking. Raw content is not stored in activity events. Explicit Save persists content/design only for the user and authorized workspace. See QR-TOOLS.md.

PRD Studio, AI assistance and automation remain potential seed directions. Additional seed names do not make them active integrations. Demonstrate two working tools with one account before expanding the catalog.

## 9. Requests as a demand engine

/requests is first-class. Ask what the user wants to make easier, not for technical specifications. Required problem description; optional workflow, frequency, example, context and future attachment support. Store requests durably and show the submitting user's history/status in their workspace.

States: submitted, reviewing, planned, building, beta, released, declined. Use simple Indonesian labels. Internal demand flow: receive → group similar problems → evaluate → candidate → validate → build → release. Review/grouping starts as an authorized operator workflow. Do not imply automated grouping or a delivery date exists.

New tool acceptance: ideally at least three of real business problem, repeated cross-user demand, repeat use, benefit from identity/workspace/data, stronger membership, useful tool connections, less manual work, reasonable infrastructure economics.

## 10. Subscription and capability model

Free: explore selected useful tools. Pro: entrepreneur/micro-business broader capabilities and higher limits. Business: teams, multiple contexts, higher limits, advanced automation. Exact pricing, limits and paid facilities require validation; example numbers in conceptual material are not release requirements.

Plan → capabilities → tools/features → limits. Never user.is_pro. Central resolver determines verified user, workspace, active subscription, tool status, capability, current usage, then allow/upgrade/limit. Validate on the server independently of UI; prevent users changing subscriptions, capabilities or usage counters directly.

/settings/billing shows actual current access and applicable usage. Renewal, invoices, payment, downgrade and cancellation appear only when the supported payment system actually exists. No invented prices, fake checkout or artificial urgency. Upgrade messaging explains useful access and links to centralized billing.

## 11. Usage, activity and notifications

Meter cost-bearing actions centrally: identity, workspace, tool, metric, quantity, timestamps and minimal necessary metadata. Usage limits are configurable; quota consumption must be atomic under concurrent actions. Use human-readable units. Count value only from relevant completed actions, not page views.

/activity contains important tool opens/outputs, requests, business changes, integrations, automation and subscription events where implemented. Avoid technical event noise. Product event feeds are not a tamper-proof audit ledger.

Future notifications: requested tool released, useful new tool, automation failure, approaching limit, business output or billing. No announcement spam.

## 12. Progressive reveal and personalization

Active → New → Coming next. Reveal only relevant possibilities based on actual availability, business context, usage, favorites, requests and plan. New means a real release; do not label arbitrary old cards new. “Continue using” derives from actual opens.

Future previews are small, calm, clearly unavailable and do not compete with active actions. They explain how repeat use can reduce work. Do not expose internal roadmap phases, APIs, n8n, webhooks or LLM terminology. No artificial unlocking or fabricated progress. Show the future; build the present.

## 13. Integrations, AI and automation

Shared integration settings at /settings/integrations; reconnecting the same service per tool should be avoided where technically possible. WhatsApp, Telegram, email, Sheets, APIs, payment and accounting integrations are future candidates, not launch promises.

Automation begins with practical templates, not a drag-and-drop builder. Useful future connections include quotation → invoice → reminder → payment → Business Report, or QR → campaign → lead → CRM → follow-up.

AI is a purposeful capability for summarization, extraction, classification, analysis or assistance, not a chatbot in every tool. Authorized data → purpose-specific context → provider abstraction → structured output → user action. Respect identity, workspace, tool, entitlement and purpose; never send unnecessary raw business data.

## 14. Design and accessibility

Preserve teal #009AA5 and graphite #434242. White, warm white, neutral gray and restrained teal surfaces. Space Grotesk headings/brand; Inter operational UI/numbers. Compact sidebar, workspace/account topbar, 1200–1400px content maximum, restrained 10–16px radius and subtle borders.

Clean, calm, functional, technical, premium, trustworthy. Avoid gradients, glows, floating blobs, robot imagery, random sparkles, fake metrics, meaningless charts, card overload and excessive animation. Not every section needs a card.

Cards communicate icon, name, purpose, honest status/access and one obvious action. Tool-specific layouts may differ when useful while sharing identity, context, navigation, upgrade, loading and error behavior.

Mobile-first: fast launch, search, recent tools, requests and business context. Comfortable touch targets; semantic headings/navigation/forms; keyboard focus; labels; accessible modal behavior; adequate contrast; no color-only meaning or horizontal form scrolling.

## 15. Complete interaction states

Async operations provide loading, success, error and meaningful empty states. Protected actions additionally handle unauthenticated, unauthorized, capability blocked and usage reached. Normal people should understand errors without database terminology. Never claim saved before persistence succeeds. Prevent duplicate financial records on retry.

Hub empty state: business ready, explore a tool or tell PRCUISA what to make easier. No fabricated business activity or customers. Preview sessions must explicitly state they are temporary and never imply authenticated durable storage.

## 16. Architecture and security

Preserve Next.js + TypeScript + Tailwind, useful shadcn/Lucide conventions, Supabase PostgreSQL/Auth/RLS, Vercel. n8n and provider-independent AI follow validated use cases.

Platform entities may include profiles, workspaces/members, apps/categories, enabled/preferences, plans/capabilities, subscriptions, usage, requests/groups/votes, activities, integrations and notifications. Implement only needed foundations; tools keep their own domain tables.

Minimum controls: HTTPS, verified identity, workspace authorization, RLS, input validation, rate limits, private endpoints, no-store private responses, secure server secrets, same-origin state-changing requests, server-side capability/usage enforcement, auditable important outcomes. User A must not read/write Workspace B without valid membership. Membership creation is restricted to ownership/invitations/authorized admin flows.

Minimize privileged functions; fix search_path; revoke public/anonymous execution; explicitly validate identity and membership inside each callable privileged boundary. Never trust user-editable metadata for role/plan. External systems use an authorized domain API rather than direct privileged writes. Do not build unused public APIs or a public marketplace.

## 17. SEO and organic acquisition

prcuisa.com accumulates public authority through useful product/tool pages, solutions, guides and documentation. app.prcuisa.com serves private application UX. Never index private identity/workspace/billing/report/request content.

Public tool pages explain task, user, problem, capabilities, workflow, actual access and PRCUISA ID CTA. Preferred long-term main-domain /tools paths may be implemented with domain-aware routing. This existing shared codebase retains /products public URLs and /tools protected application URLs to preserve canonical continuity without leaking private content.

Public requirements: unique human title/description, canonical, one H1/semantic hierarchy, crawlable/server-renderable useful text, meaningful internal links, Open Graph/social metadata, truthful structured data, deliberate robots/sitemap, descriptive image alt and optimized fonts/images. Never fake prices/ratings/reviews/authors/customer counts or generate thin keyword pages. Sitemap contains only intentional public canonical URLs. Authentication and RLS are actual security; robots is not security.

Organic journey: useful problem content → relevant tool → PRCUISA ID → value → ecosystem discovery → subscription. Measure qualified activation, not raw page views. Public content should answer clear factual questions for users and answer systems. Localization stays architecturally possible without duplicating thin translated pages.

## 18. Performance

Server render acquisition content, minimize client JavaScript, lazy-load specialized tools, use optimized local fonts, stable layouts, efficient aggregates/pagination, sensible caching and few third-party scripts. Do not cache private workspace data publicly. Performance and accessibility are part of product quality.

## 19. Analytics and validation

Platform events: signup_completed, workspace_created, hub_viewed, tool_searched, tool_viewed, tool_opened, tool_value_completed, tool_favorited, second_tool_opened, tool_request_submitted, upgrade_viewed/clicked, subscription_started/cancelled where corresponding real behavior exists. Tool-specific analytics remain separate. Never emit subscription events without an actual subscription.

Funnel: visitor → ID → Hub → first tool → first meaningful value → return/repeat or second tool → upgrade → paid member.

Metrics: activated IDs, weekly active IDs/workspaces receiving value, tool activation, multi-tool adoption, repeat use, request demand, conversion, paid retention. Long-term: useful tools per active paid account. Do not push irrelevant tools to inflate the number.

Validate with 10–20 real users: account creation, first value, repeat use, some second-tool adoption, real requests and willingness to pay. No scaling theater before recurring value.

## 20. Phases and scope

1. Identity, profile, workspace/membership, shell and secure RLS.
2. Hub, registry, discovery/search, recent/favorites, launcher/activity.
3. Two genuinely usable tools with one identity, workspace, access validation and return navigation.
4. Requests/history, authorized review/grouping and demand tracking.
5. Configurable plans/capabilities/usage, validated billing/payment gateway and upgrade.
6. Demand-driven tools, integrations, AI and useful cross-tool automation.

Do not immediately build ERP, enterprise accounting, HRIS, POS, advanced CRM/inventory, public developer/partner marketplace, complex RBAC, arbitrary plugins, workflow/dashboard builders, native mobile apps or dozens of unfinished agents. First prove first-party ecosystem value.

## 21. Business model, flywheel and moat

Reusable tools → platform → many users → subscription → recurring revenue → demand → better ecosystem. Selected custom services may inform reusable capabilities. Users join, use tools, request solutions, PRCUISA evaluates common demand, releases useful tools, membership value grows, more users join.

Moat should grow from established identity, coherent ecosystem, useful connections, business context, authorized data, automation, demand learning and membership value, rather than one isolated feature.

Decision filter: real problem, multiple users, repeat use, value from PRCUISA ID, useful connections, stronger membership, affordable operations. Reject weak additions.

## 22. Acceptance and definition of done

A screen is unmistakably PRCUISA, calm, mobile usable and clear about the next action and tool availability. A tool has working identity, workspace isolation, entitlements, loading/error/empty states, actual utility, safe secrets, analytics and return to Hub.

MVP done means a new real user can visit → create/verify PRCUISA ID → create/select business → Hub → find/open Tool A → complete useful action → return → Tool B without another registration → submit request → understand access → return later without founder assistance. Local preview and source completion alone do not meet this definition. Real auth, durable storage and production isolation must be verified.

**Build tools. Connect them. Keep one identity. Grow from real user demand.**
