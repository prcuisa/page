// Report variable names only; never print credential values.
if (process.env.VERCEL_ENV !== 'production' && !process.argv.includes('--strict')) {
  console.log('Preview/local build: production configuration gate skipped.');
  process.exit(0);
}
const errors = [];
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_APP_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]?.trim()) errors.push(`${key} is required`);
}
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_APP_URL']) {
  try {
    const url = new URL(process.env[key]);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) throw new Error();
  } catch { errors.push(`${key} must be a public HTTPS URL`); }
}
if (process.env.INDEX_PUBLIC_CONTENT !== 'false') errors.push('INDEX_PUBLIC_CONTENT must be false for the private Hub');
const groups = [
  ['NEXT_PUBLIC_FIREBASE_API_KEY','NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN','NEXT_PUBLIC_FIREBASE_PROJECT_ID','NEXT_PUBLIC_FIREBASE_APP_ID'],
  ['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','TELEGRAM_WEBHOOK_SECRET'],
  ['WAHA_URL','WAHA_API_KEY'], ['RESEND_API_KEY','CONNECT_EMAIL_FROM'],
  ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'],
];
for (const group of groups) if (group.some(k => process.env[k])) {
  for (const key of group) if (!process.env[key]) errors.push(`${key} is required for its configured provider`);
}
if (groups.slice(1).some(g => g.some(k => process.env[k])) || process.env.CONNECT_WEBHOOK_ENABLED === 'true') {
  if (!/^[a-fA-F0-9]{64}$/.test(process.env.CONNECT_ENCRYPTION_KEY || '')) errors.push('CONNECT_ENCRYPTION_KEY must contain 64 hex characters');
}
if (process.env.MIDTRANS_SERVER_KEY && process.env.MIDTRANS_IS_PRODUCTION !== 'true') errors.push('Production checkout requires MIDTRANS_IS_PRODUCTION=true; remove the key to keep checkout disabled');
if (errors.length) { console.error('Production configuration incomplete:\n' + errors.map(e => `- ${e}`).join('\n')); process.exit(1); }
console.log('Production environment shape validated. Live provider and database checks are still required.');
