# Google sign-in and Midtrans setup

The application contains the OAuth and checkout flows. They stay unavailable until the external accounts and production secrets are configured.

## Google sign-in (Supabase Auth)

1. Create a Web OAuth client in Google Cloud Console. Set the authorized JavaScript origin to the app origin.
2. Add the Supabase project's Auth callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI in Google.
3. In Supabase Authentication → Sign In / Providers → Google, enable the provider and save the Google client ID and client secret.
4. In Supabase Authentication → URL Configuration, add the app callback `https://<app-host>/auth/callback` to the redirect allow list. Add the local equivalent while developing.
5. Test login and signup with a real Google account. The app uses the PKCE callback route to exchange the code for a cookie-backed session.

The Google client secret belongs in Supabase Auth provider settings. It is not an app or browser environment variable.

## Midtrans Snap

1. Apply `supabase/migrations/20261008120000_midtrans_billing.sql` after the ecosystem and QR migrations.
2. After plan prices and the billing period are approved, configure the catalog from a trusted SQL session, for example:

   ```sql
   update public.billing_plans
   set amount_idr = <approved_integer_idr>, period_days = <approved_period_days>, active = true, updated_at = now()
   where plan_id = 'pro';
   ```

   Repeat for `business`. No prices are preloaded by the migration.

3. Add these secrets in the server deployment environment: `MIDTRANS_SERVER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Set `MIDTRANS_IS_PRODUCTION=false` for sandbox or `true` only after live merchant verification. `NEXT_PUBLIC_APP_URL` must be the canonical app origin.
4. In Midtrans MAP settings, set Payment Notification URL to `https://<app-host>/api/billing/midtrans/webhook`.
5. Test sandbox checkout, pending payment, settlement, duplicate notification delivery, amount mismatch, and a denied/expired payment. Confirm access changes only after a verified successful payment.

Checkout amount and order ID come from the server and the billing catalog. The webhook ignores the supplied notification status, checks that the order exists in PRCUISA, fetches its current status directly from Midtrans, checks the amount, then applies it through a service-role-only database function. Browser redirects never grant membership. The current membership period uses `billing_plans.period_days`; billing settings display payment history and membership status.

There is no recurring automatic charge or self-service cancellation flow in this implementation. These need explicit product and merchant configuration decisions before they are offered.
