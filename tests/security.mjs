import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`,
);
await db.exec(
  await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
);
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${a}','owner@example.test',now()),('${b}','member@example.test',now());`);
const as = async (user) => {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
  );
};
await as(a);
const wa = (
  await db.query(
    `insert into public.workspaces(name,owner_id) values('Usaha A','${a}') returning id`,
  )
).rows[0].id;
const tx = "11111111-1111-4111-8111-111111111111";
await db.exec(
  `insert into public.transactions(id,workspace_id,created_by,kind,amount,category,date) values('${tx}','${wa}','${a}','revenue',2500000,'Penjualan','2026-10-07'); insert into public.transactions(id,workspace_id,created_by,kind,amount,category,date) values(gen_random_uuid(),'${wa}','${a}','expense',700000,'Pakan','2026-10-07');`,
);
const summary = (
  await db.query(
    `select public.business_summary('${wa}','2026-10-01','2026-10-07','2026-09-24','2026-09-30') as value`,
  )
).rows[0].value;
assert.equal(summary.revenue, 2500000);
assert.equal(summary.expense, 700000);
assert.equal(summary.count, 2);
assert.equal(summary.largest_revenue, 2500000);
assert.equal(summary.largest_expense, 700000);
assert.equal(
  (await db.query(`select public.business_usage('${wa}') as value`)).rows[0]
    .value.record_count,
  2,
);
assert.equal(summary.largest_category, "Pakan");
await db.exec(
  `insert into public.transactions(id,workspace_id,created_by,kind,amount,date) values('${tx}','${wa}','${a}','revenue',2500000,'2026-10-07') on conflict(id) do nothing;`,
);
assert.equal(
  (await db.query(`select count(*)::int as n from public.transactions`)).rows[0]
    .n,
  2,
);
await assert.rejects(() =>
  db.exec(
    `insert into public.transactions(id,workspace_id,created_by,kind,amount) values(gen_random_uuid(),'${wa}','${a}','expense',-1)`,
  ),
);
await as(b);
assert.equal(
  (await db.query(`select public.business_usage('${wa}') as value`)).rows[0]
    .value.record_count,
  0,
);
assert.equal(
  (await db.query("select * from public.workspaces")).rows.length,
  0,
);
assert.equal(
  (await db.query("select * from public.transactions")).rows.length,
  0,
);
assert.equal(
  (await db.query("select * from public.activity_events")).rows.length,
  0,
);
assert.equal(
  (
    await db.query(
      `select public.business_summary('${wa}','2026-10-01','2026-10-07','2026-09-24','2026-09-30') as value`,
    )
  ).rows[0].value.count,
  0,
);
await assert.rejects(() =>
  db.exec(
    `insert into public.transactions(id,workspace_id,created_by,kind,amount) values(gen_random_uuid(),'${wa}','${b}','revenue',100)`,
  ),
);
await assert.rejects(() =>
  db.exec(
    `insert into public.workspace_members values('${wa}','${b}','editor')`,
  ),
);
await as(a);
await assert.rejects(() =>
  db.exec(`update public.workspaces set owner_id='${b}' where id='${wa}'`),
);
await db.exec(
  `reset role;insert into public.workspace_members values('${wa}','${b}','viewer');`,
);
await as(b);
assert.equal(
  (await db.query("select * from public.transactions")).rows.length,
  2,
);
await assert.rejects(() =>
  db.exec(
    `insert into public.transactions(id,workspace_id,created_by,kind,amount) values(gen_random_uuid(),'${wa}','${b}','expense',100)`,
  ),
);
await db.exec(
  `reset role;update public.workspace_members set role='editor' where user_id='${b}';`,
);
await as(b);
await db.exec(
  `insert into public.transactions(id,workspace_id,created_by,kind,amount) values(gen_random_uuid(),'${wa}','${b}','expense',100)`,
);
// Platform identity, requests, entitlements, usage, and catalog boundaries.
await as(a);
await db.query(
  `select public.platform_action('${wa}','open','business-report')`,
);
await db.query(`select public.platform_action('${wa}','open','qr')`);
assert.equal(
  (
    await db.query(
      `select count(*)::int as n from public.platform_events where name='second_tool_opened'`,
    )
  ).rows[0].n,
  1,
);
await db.query(
  `select public.platform_action('${wa}','favorite','qr','{"favorite":true}')`,
);
assert.equal(
  (
    await db.query(
      `select favorite from public.workspace_apps where app_id='qr'`,
    )
  ).rows[0].favorite,
  true,
);
await db.query(
  `select public.platform_action('${wa}','request',null,'{"problem":"Saya perlu pengingat pembayaran pelanggan"}')`,
);
assert.equal(
  (await db.query(`select count(*)::int as n from public.tool_requests`))
    .rows[0].n,
  1,
);
await assert.rejects(() =>
  db.query(`update public.tool_requests set status='released'`),
);
await assert.rejects(() =>
  db.query(`update public.apps set status='active' where slug='ai-assistant'`),
);
await assert.rejects(() =>
  db.query(
    `insert into public.subscriptions(user_id,plan_id,status) values('${a}','pro','active')`,
  ),
);
await assert.rejects(() =>
  db.query(
    `insert into public.usage_events(user_id,workspace_id,app_id) values('${a}','${wa}','qr')`,
  ),
);
await assert.rejects(() =>
  db.query(`select public.platform_action('${wa}','value','business-report')`),
);
await assert.rejects(() =>
  db.query(`select public.platform_action('${wa}','open','ai-assistant')`),
);
await as(b);
assert.equal(
  (await db.query(`select * from public.tool_requests`)).rows.length,
  0,
);
assert.equal(
  (await db.query(`select * from public.workspace_apps`)).rows.length,
  0,
);
await db.exec(
  `reset role;delete from public.workspace_members where user_id='${b}';`,
);
await as(b);
await assert.rejects(() =>
  db.query(`select public.platform_action('${wa}','open','qr')`),
);
await assert.rejects(() =>
  db.query(`select public.platform_access('${wa}','qr')`),
);
await as(a);
await db.exec(
  `reset role;update public.plan_entitlements set monthly_limit=1 where capability='qr' and plan_id='free';`,
);
await as(a);
await db.query(`select public.platform_action('${wa}','qr','qr')`);
await assert.rejects(() =>
  db.query(`select public.platform_action('${wa}','qr','qr')`),
);
assert.equal(
  (await db.query(`select public.platform_access('${wa}','qr') as v`)).rows[0].v
    .used,
  1,
);
await db.exec(
  `reset role;update public.plan_entitlements set enabled=false where capability='business-report' and plan_id='free';`,
);
await as(a);
await assert.rejects(() =>
  db.query(
    `insert into public.transactions(id,workspace_id,created_by,kind,amount) values(gen_random_uuid(),'${wa}','${a}','revenue',99)`,
  ),
);
assert.equal(
  (await db.query(`select count(*)::int as n from public.transactions`)).rows[0]
    .n,
  3,
);
await db.exec(
  `reset role;update public.plan_entitlements set enabled=true where capability='business-report' and plan_id='free';`,
);
// Midtrans: server-owned prices and orders, isolated reads, and verified settlement only.
await db.exec(
  `reset role;update public.billing_plans set amount_idr=125000,period_days=30,active=true where plan_id='pro';`,
);
await as(a);
const payment = (
  await db.query(
    `select public.create_midtrans_payment('${wa}','pro') as value`,
  )
).rows[0].value;
assert.equal(payment.amount_idr, 125000);
assert.match(payment.order_id, /^PRC-[a-f0-9]{32}$/);
await assert.rejects(() =>
  db.query(
    `update public.payments set status='paid' where order_id='${payment.order_id}'`,
  ),
);
await assert.rejects(() =>
  db.query(
    `select public.apply_midtrans_notification('${payment.order_id}',125000,'settlement','','tx','bank_transfer')`,
  ),
);
await assert.rejects(() =>
  db.query(
    `select public.create_midtrans_payment('00000000-0000-4000-8000-000000000099','pro')`,
  ),
);
await db.exec(`reset role;set role service_role;`);
await assert.rejects(() =>
  db.query(
    `select public.apply_midtrans_notification('${payment.order_id}',125001,'settlement','','tx','bank_transfer')`,
  ),
);
const settled = (
  await db.query(
    `select public.apply_midtrans_notification('${payment.order_id}',125000,'settlement','','tx','bank_transfer') as value`,
  )
).rows[0].value;
assert.equal(settled.status, "paid");
const duplicate = (
  await db.query(
    `select public.apply_midtrans_notification('${payment.order_id}',125000,'settlement','','tx','bank_transfer') as value`,
  )
).rows[0].value;
assert.equal(duplicate.already_applied, true);
await db.exec(`reset role;`);
assert.equal(
  (
    await db.query(
      `select plan_id,status from public.subscriptions where user_id='${a}'`,
    )
  ).rows[0].plan_id,
  "pro",
);
console.log(
  "PASS: Midtrans plan prices, workspace authorization, trusted settlement, amount verification, and idempotent membership grant.",
);
console.log(
  "PASS: registry protection, request privacy/status, no self-upgrade, private usage, tool availability, limits, multi-tool events, and transactional entitlement rollback.",
);
// QR designs: own identity + authorized workspace, centralized write checks.
await db.exec(
  `reset role;update public.plan_entitlements set monthly_limit=null where capability='qr' and plan_id='free';`,
);
await as(a);
await db.query(
  `select public.save_qr_design('${wa}','Menu','{"type":"url","fields":{"url":"https://prcuisa.com"},"style":{}}')`,
);
assert.equal(
  (await db.query(`select count(*)::int as n from public.qr_designs`)).rows[0]
    .n,
  1,
);
await assert.rejects(() =>
  db.query(
    `insert into public.qr_designs(user_id,workspace_id,name,design) values('${a}','${wa}','Direct','{}')`,
  ),
);
await as(b);
assert.equal(
  (await db.query(`select * from public.qr_designs`)).rows.length,
  0,
);
await assert.rejects(() =>
  db.query(
    `select public.save_qr_design('${wa}','No access','{"type":"url","fields":{},"style":{}}')`,
  ),
);
await db.exec(
  `reset role;update public.plan_entitlements set enabled=false where capability='qr';`,
);
await as(a);
await assert.rejects(() =>
  db.query(
    `select public.save_qr_design('${wa}','Blocked','{"type":"url","fields":{},"style":{}}')`,
  ),
);
console.log(
  "PASS: QR design ownership, revoked membership, no direct insert, server entitlement enforcement.",
);
// Legacy invoice remains available for existing issued documents and users during transition.
await db.exec(`reset role;update public.plan_entitlements set enabled=true,monthly_limit=null where capability='invoice' and plan_id='free';`);
// Invoice saves recompute totals inside the authorized server function.
await as(a);
const invoicePayload = JSON.stringify({
  sender: { name: "Usaha A", address: "", email: "" },
  client: { name: "Klien A", address: "", email: "" },
  items: [{ description: "Jasa", quantity: 2, unit_price: 250000 }],
  tax_rate: 11,
  discount_rate: 10,
  notes: "",
  logo_data_url: null,
});
const invoice = (
  await db.query(
    `select public.save_invoice('${wa}','INV-001','2026-10-08','${invoicePayload}'::jsonb) as value`,
  )
).rows[0].value;
assert.equal(invoice.subtotal, 500000);
assert.equal(invoice.discount, 50000);
assert.equal(invoice.tax, 49500);
assert.equal(invoice.total, 499500);
assert.equal(
  (await db.query(`select count(*)::int as n from public.invoices`)).rows[0].n,
  1,
);
await assert.rejects(() =>
  db.query(
    `insert into public.invoices(user_id,workspace_id,invoice_number,invoice_date,payload,subtotal,discount,tax,total) values('${a}','${wa}','INV-DIRECT','2026-10-08','{}',0,0,0,0)`,
  ),
);
await as(b);
assert.equal((await db.query(`select * from public.invoices`)).rows.length, 0);
await assert.rejects(() =>
  db.query(
    `select public.save_invoice('${wa}','INV-OTHER','2026-10-08','${invoicePayload}'::jsonb)`,
  ),
);
await as(a);
await db.exec(
  `reset role;update public.plan_entitlements set enabled=false where capability='invoice';`,
);
await as(a);
await assert.rejects(() =>
  db.query(
    `select public.save_invoice('${wa}','INV-BLOCKED','2026-10-08','${invoicePayload}'::jsonb)`,
  ),
);
console.log(
  "PASS: invoice total recalculation, workspace isolation, no direct writes, and server entitlement enforcement.",
);

// Invoice & Quotation: workspace-owned customer, precise server totals, immutable issuance,
// atomic official numbering, accepted quote conversion, and auditable partial payments.
await db.exec(`reset role;update public.plan_entitlements set enabled=true,monthly_limit=null where capability in('invoice-quotation','invoice_quotation.create_quotation','invoice_quotation.create_invoice','invoice_quotation.pdf_export') and plan_id='free';`);
await as(a);
const cust=(await db.query(`select public.iq_action('${wa}','customer','{"name":"Klien Uji","company_name":"Klien Uji PT"}'::jsonb) value`)).rows[0].value.id;
const draftPayload=JSON.stringify({document_type:'quotation',customer_id:cust,issue_date:'2026-10-08',valid_until:'2026-10-31',discount_rate:'10',tax_rate:'11',items:[{description:'Jasa desain',quantity:'1.5',unit_price:'100000.50',discount_rate:'10',unit:'jam'}]});
const quote=(await db.query(`select public.iq_action('${wa}','draft','${draftPayload}'::jsonb) value`)).rows[0].value;
assert.equal(Number(quote.subtotal),135001);
assert.equal(Number(quote.discount_total),13500);
assert.equal(Number(quote.tax_total),13365);
assert.equal(Number(quote.grand_total),134866);
const issued=(await db.query(`select public.iq_action('${wa}','issue','{"id":"${quote.id}","version":${quote.version}}'::jsonb) value`)).rows[0].value;
assert.match(issued.document_number,/^QT-2026-0001$/);
assert.equal(issued.lifecycle_status,'issued');
assert.equal((await db.query(`select public.iq_action('${wa}','issue','{"id":"${quote.id}","version":${quote.version}}'::jsonb) value`)).rows[0].value.document_number,issued.document_number);
await db.query(`select public.iq_action('${wa}','accept','{"id":"${quote.id}"}'::jsonb)`);
const converted=(await db.query(`select public.iq_action('${wa}','convert','{"id":"${quote.id}"}'::jsonb) value`)).rows[0].value;
assert.equal(converted.document_type,'invoice');
assert.equal(converted.lifecycle_status,'draft');
assert.equal(converted.customer_snapshot.name,'Klien Uji');
const issuedInvoice=(await db.query(`select public.iq_action('${wa}','issue','{"id":"${converted.id}","version":${converted.version}}'::jsonb) value`)).rows[0].value;
assert.match(issuedInvoice.document_number,/^INV-2026-0001$/);
const pdfRecord=(await db.query(`select public.iq_pdf_document('${wa}','${issuedInvoice.id}') value`)).rows[0].value;
assert.equal(pdfRecord.document_number,issuedInvoice.document_number);
await db.query(`select public.iq_pdf_record('${wa}','${issuedInvoice.id}')`);
assert.equal((await db.query(`select count(*)::int n from public.usage_events where app_id='invoice-quotation' and metric='pdf_generated'`)).rows[0].n,1);
const pay={id:issuedInvoice.id,amount:'50000',payment_date:'2026-10-08',method:'bank',idempotency_key:'22222222-2222-4222-8222-222222222222'};
await db.query(`select public.iq_action('${wa}','payment','${JSON.stringify(pay)}'::jsonb)`);
await db.query(`select public.iq_action('${wa}','payment','${JSON.stringify(pay)}'::jsonb)`);
const withPayment=(await db.query(`select public.iq_read('${wa}',doc=>'${issuedInvoice.id}') value`)).rows[0].value;
assert.equal(withPayment.payments.length,1);
assert.equal(Number(withPayment.grand_total)-withPayment.payments.reduce((n,p)=>n+Number(p.amount),0),84866);
await assert.rejects(()=>db.query(`select public.iq_action('${wa}','payment','${JSON.stringify({...pay,idempotency_key:'33333333-3333-4333-8333-333333333333',amount:'200000'})}'::jsonb)`));
await assert.rejects(()=>db.query(`select public.iq_action('${wa}','draft','${JSON.stringify({...JSON.parse(draftPayload),customer_id:'00000000-0000-4000-8000-000000000099'})}'::jsonb)`));
await db.exec(`reset role;insert into public.workspace_members(workspace_id,user_id,role) values('${wa}','${b}','viewer');`);
await as(b);
assert.equal((await db.query(`select public.iq_read('${wa}','invoices') value`)).rows[0].value.rows.length,1);
assert.equal((await db.query(`select * from public.iq_documents`)).rows.length,2);
await assert.rejects(()=>db.query(`select public.iq_action('${wa}','customer','{"name":"Viewer tidak boleh menulis"}'::jsonb)`));
await db.exec(`reset role;delete from public.workspace_members where workspace_id='${wa}' and user_id='${b}';`);
await as(b);
await assert.rejects(()=>db.query(`select public.iq_read('${wa}','invoices')`));
console.log('PASS: IQ exact arithmetic, atomic numbering, snapshots, quotation conversion, idempotent payment, overpayment guard, workspace RLS and viewer write denial.');


// Workspace membership, public idea voting, and trusted admin controls.
await db.exec(`reset role;`);
await as(a);
const inv=(await db.query(`select public.foundation_action('invite','${wa}','{"email":"member@example.test","role":"viewer"}'::jsonb) value`)).rows[0].value;
assert.equal(inv.ok,true);
await as(b);
const inviteSnap=(await db.query(`select public.foundation_snapshot() value`)).rows[0].value;
assert.equal(inviteSnap.invitations.length,1);
const inviteId=inviteSnap.invitations[0].id;
await db.query(`select public.foundation_action('accept',null,'{"id":"${inviteId}"}'::jsonb)`);
assert.equal((await db.query(`select public.foundation_snapshot('${wa}') value`)).rows[0].value.role,'viewer');
await assert.rejects(()=>db.query(`select public.foundation_action('accept',null,'{"id":"${inviteId}"}'::jsonb)`));
await as(a);
const groupId='44444444-4444-4444-8444-444444444444';
await db.exec(`reset role;insert into public.request_groups(id,title,description,status,is_public) values('${groupId}','Invoice usaha kecil','Kebutuhan invoice UMKM','reviewing',true);`);
const before=(await db.query(`select public.foundation_snapshot('${wa}') value`)).rows[0].value.ideas[0];
assert.equal(before.votes,0);
await db.query(`select public.foundation_action('vote','${wa}','{"id":"${groupId}","voted":true}'::jsonb)`);
await db.query(`select public.foundation_action('vote','${wa}','{"id":"${groupId}","voted":true}'::jsonb)`);
const after=(await db.query(`select public.foundation_snapshot('${wa}') value`)).rows[0].value.ideas[0];
assert.equal(after.votes,1);assert.equal(after.voted,true);
await assert.rejects(()=>db.query(`select public.admin_snapshot()`));
await db.exec(`reset role;insert into public.platform_admins(user_id) values('${a}');`);
await as(a);
assert.equal((await db.query(`select public.is_platform_admin() value`)).rows[0].value,true);
await db.query(`select public.admin_action('entitlement','{"plan_id":"free","capability":"invoice_quotation.create_quotation","enabled":true,"monthly_limit":12}'::jsonb)`);
await db.query(`select public.admin_action('billing','{"plan_id":"pro","amount_idr":129000,"period_days":30,"active":true}'::jsonb)`);
const admins=(await db.query(`select public.admin_snapshot() value`)).rows[0].value;
assert.ok(admins.entitlements.some(x=>x.capability==='invoice_quotation.create_quotation'&&x.monthly_limit===12));
assert.ok(admins.audit.length>=2);
await assert.rejects(()=>db.query(`select public.admin_action('app','{"slug":"not-integrated","name":"Tool","description":"Test","category":"AI","status":"active","is_public":true}'::jsonb)`));
console.log('PASS: workspace invitation acceptance is identity-bound/idempotent, votes deduplicate, and admin controls are audited and non-admin protected.');

await db.exec("reset role;set role anon;");
await assert.rejects(() => db.query("select * from public.transactions"));
console.log(
  "PASS: amounts, summary, idempotency, cross-workspace read/write denial, no self-membership, owner reassignment denial, viewer/editor permissions, anonymous denial.",
);
await db.close();
