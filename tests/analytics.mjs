import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
await db.exec(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'));

const users = Array.from({ length: 9 }, () => randomUUID());
await db.query('insert into auth.users(id,email,email_confirmed_at) select unnest($1::uuid[]), unnest(array_fill(\'test@example.test\'::text,array[9])),now()', [users]);
const workspaces = [];
for (let i = 0; i < users.length; i++) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i]]);
  const row = (await db.query('insert into public.workspaces(name,owner_id) values($1,$2) returning id', [`Usaha ${i + 1}`, users[i]])).rows[0];
  workspaces.push(row.id);
  const day1 = `now() - interval '${i % 2 === 0 ? 1 : 2} days'`;
  const day2 = `now() - interval '${i % 2 === 0 ? 2 : 3} days'`;
  await db.exec(`insert into public.platform_events(user_id,workspace_id,app_id,name,created_at) values ('${users[i]}','${row.id}','business-report','tool_value_completed',${day1}),('${users[i]}','${row.id}','business-report','tool_value_completed',${day2})`);
}
// An open hit alone and a single-day completion do not qualify as routine.
const openUser = randomUUID();
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [openUser, 'open@example.test']);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [openUser]);
const openWorkspace = (await db.query('insert into public.workspaces(name,owner_id) values($1,$2) returning id', ['Usaha open', openUser])).rows[0].id;
await db.exec(`insert into public.platform_events(user_id,workspace_id,app_id,name) values('${openUser}','${openWorkspace}','business-report','tool_opened')`);
const oneDay = randomUUID();
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [oneDay, 'oneday@example.test']);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [oneDay]);
const oneDayWorkspace = (await db.query('insert into public.workspaces(name,owner_id) values($1,$2) returning id', ['Usaha one day', oneDay])).rows[0].id;
await db.exec(`insert into public.platform_events(user_id,workspace_id,app_id,name,created_at) values('${oneDay}','${oneDayWorkspace}','business-report','tool_value_completed',now()),('${oneDay}','${oneDayWorkspace}','business-report','tool_value_completed',now())`);

await db.exec('reset role;set role anon');
const belowThreshold = (await db.query('select public.public_routine_usage_proof() as value')).rows[0].value;
assert.equal(belowThreshold.available, false);
assert.equal(belowThreshold.user_bucket, 0);

await db.exec('reset role');
const tenthUser = randomUUID();
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [tenthUser, 'tenth@example.test']);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [tenthUser]);
const tenthWorkspace = (await db.query('insert into public.workspaces(name,owner_id) values($1,$2) returning id', ['Usaha sepuluh', tenthUser])).rows[0].id;
await db.exec(`insert into public.platform_events(user_id,workspace_id,app_id,name,created_at) values ('${tenthUser}','${tenthWorkspace}','business-report','tool_value_completed',now()-interval '1 day'),('${tenthUser}','${tenthWorkspace}','business-report','tool_value_completed',now()-interval '2 days')`);
await db.exec('set role anon');
const proof = (await db.query('select public.public_routine_usage_proof() as value')).rows[0].value;
assert.equal(proof.available, true);
assert.equal(proof.user_bucket, 10);
assert.equal(proof.window_days, 7);
assert.deepEqual(Object.keys(proof).sort(), ['activity_days_required', 'available', 'user_bucket', 'window_days']);

const admin = randomUUID();
await db.exec('reset role');
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [admin, 'admin@example.test']);
await db.query('insert into public.platform_admins(user_id) values($1)', [admin]);
await db.exec('set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
const snapshot = (await db.query('select public.admin_snapshot() as value')).rows[0].value;
assert.equal(Number(snapshot.analytics.routine_users_7d), 10);
assert.equal(Number(snapshot.analytics.routine_workspaces_7d), 10);
assert.equal(Number(snapshot.analytics.completed_values_7d), 22);
assert.equal(Number(snapshot.analytics.tool_opens_30d), 1);
assert.equal(Number(snapshot.analytics.tools.find((t) => t.app_id === 'business-report').routine_users_7d), 10);
assert.equal(snapshot.analytics.daily_values_14d.length, 14);
assert.ok(snapshot.analytics.daily_values_14d.some((day) => Number(day.count) === 0));

await db.exec('reset role;set role authenticated');
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[0]]);
await assert.rejects(() => db.query('select public.admin_snapshot()'));
console.log('PASS analytics: routine usage uses distinct WIB dates, opens stay separate, public proof is thresholded and identity-free, and admin metrics are restricted.');
await db.close();
