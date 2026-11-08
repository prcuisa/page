# PRCUISA Tool Contract v2

## Identity and context

In-Hub tools share Supabase Auth cookies and authenticated route layout. Every API verifies getUser(), never merely a supplied user ID. workspace_id is untrusted input; RLS or the explicit privileged-function membership check must authorize it. Profile name/email are display-only metadata.

The `/api/platform?context=1` request resolves available businesses without fetching Business Report records. `/api/platform?workspace=UUID` loads registry/preferences/access. `/api/hub` remains the Business Report domain API. No raw QR content is stored in events or shared with Business Report. The dedicated /api/qr endpoint meters export authorizations and saves named private designs; see QR-TOOLS.md.

External PRCUISA tools are not integrated yet. Use a standards-based authorization-code flow (PKCE, state/nonce, issuer/audience validation and short-lived tokens) when an identity authority is selected. Never pass Supabase access tokens in launch URLs or copy them into cross-domain storage. Independent tools must validate workspace membership and capability server-side. Do not claim cross-subdomain SSO until tested.

## Registration and launch

Production registry: public.apps; preview seed: src/lib/app-registry.json. Launch destinations only support implemented first-party adapters (`business-report`, `qr`). Adding a row alone must not make an external site trusted. Implement a tool adapter, access boundary and tests before enabling its status.

Business Report and QR Tools are the two active capabilities. Asisten Bisnis is an explicitly unavailable informational preview. Paid pricing/limits are not invented. All three plan definitions initially grant only the two implemented tools; Pro/Business cannot be purchased yet.

## Access and metering

`platform_access` resolves active/trialing unexpired subscription or Free, capability/status and current Jakarta-month usage. `platform_action` validates auth.uid and workspace ownership/membership, serializes writes for a user with a transaction advisory lock, checks a configurable capability quota and enforces 60 events/minute abuse protection. Direct clients cannot modify the registry, subscription, capability, usage, requests or preferences; narrowly authorized RPCs own writes.

Business Report's AFTER INSERT trigger invokes the same capability/metering function. A denied capability or exhausted quota rolls back the entire financial transaction. ON CONFLICT idempotent retry produces no second record or usage event. Historical entries remain owned by their original business. Viewers cannot insert financial records; editors can. Workspace members can use QR and submit their own requests.

Usage is per PRCUISA ID across business contexts, matching the one-subscription model. Access display includes monthly usage where configured; no invented limits are shown. The original URL generator meters generation requests; the custom editor meters explicit export authorizations and named saves. Local preview rendering is unmetered. No paid charge is active. QR generation is static; no redirect service or remote URL fetch occurs.

## Demand and analytics

Requests are private to the submitting user and authorized workspace. Operators use a restricted database workflow for status/group updates; no browser admin/self-status-write API exists. request_groups is an internal grouping foundation, not an automated clustering feature. Review query: database/request-review.sql.

Platform events store identifiers and event names, never submitted problems or QR URLs. Activity deliberately hides Hub views/search technical noise. Tool value comes from an actual transaction insert or generated QR. A browser-reported open/favorite/request is a product event, not a compliance ledger. Signup/confirmation records remain in Supabase Auth; workspace creation is stored by the existing foundation.

## Deferred integration gates

Live Supabase activation/configuration and actual email confirmation/recovery verification are required before production. Paid checkout requires a selected gateway, signed idempotent webhooks, renewal/cancellation and entitlement lifecycle tests. Attachments/votes/notifications/integrations and external SSO are not shipped. No production domain/DNS change is part of this preview.
