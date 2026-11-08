# Google Firebase and Midtrans activation

## Google sign-in
The browser uses Firebase Google popup sign-in, exchanges the Google provider ID token with Supabase, and clears the temporary in-memory Firebase session. Existing Supabase PRCUISA IDs, cookies, workspace membership, and RLS remain authoritative. Firebase UID is not used as a workspace identity.

1. Enable Google in Firebase Authentication; register the web application.
2. Configure NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID in the Vercel preview environment.
3. Add the stable preview hostname and production hostname (only when launching production) to Firebase authorized domains. Configure the Firebase auth handler/OAuth origins in Google Cloud as required by Firebase.
4. Enable Google in Supabase Auth and include the Firebase Google web OAuth client ID among accepted client IDs. Keep token verification enabled. Configure the corresponding Google OAuth credentials directly in the provider console.
5. Redeploy after changing NEXT_PUBLIC variables.
6. Test new and existing Google accounts: login, workspace access, logout, expired session, blocked/cancelled popup. Test an existing email account using the same Google email and check provider linking policy before launch.

Without Firebase config, the existing Supabase Google OAuth flow remains available. Partial Firebase config fails safely. No Firebase Admin key or service-role key belongs in browser code. Real Google login has not been validated without provider credentials/configuration.

## Midtrans
Uses the existing server-created Snap redirect checkout and verified status/webhook processing. Pricing is read from billing_plans, never invented in the UI. Choose a plan, review the price/period, then explicitly continue to Midtrans. Current plan remains server-derived.

1. Apply existing billing migrations and configure validated prices/periods in billing_plans. No new price assumptions or database migrations in this change.
2. Configure MIDTRANS_SERVER_KEY, MIDTRANS_IS_PRODUCTION=false for sandbox, NEXT_PUBLIC_APP_URL, and SUPABASE_SERVICE_ROLE_KEY server-side in Vercel.
3. Configure Midtrans notification URL to /api/billing/midtrans/webhook on the intended deployment. Payment notification must reach the endpoint without Vercel protection blocking it. Finish redirect is not proof of payment.
4. Run sandbox successful, pending, denied, expired, duplicate webhook, amount mismatch and manual refresh cases. Verify plan activation only after server verification.
5. Production keys and live checkout require separate merchant activation. No real payment was initiated during this UI update.

## Verification
Typecheck, production build and existing security suite run for this change. Live Google OAuth and Midtrans settlement require the above external configuration. Browser interaction verification should cover 375px mobile filter/reset/pagination, delayed search response ordering, plan review, popup cancellation and returning from checkout.
