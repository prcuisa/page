begin;
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords)
values('invoice-quotation','Invoice & Quotation','Buat penawaran, terbitkan invoice, dan catat pembayaran.','Bisnis','invoice','/tools/invoice-quotation','active','included','free',true,true,'invoice quotation penawaran tagihan pelanggan jasa pembayaran') on conflict(slug) do nothing;
update public.apps set is_featured=false where slug='invoice';
insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit)
select p.id,c,true,null from public.plans p cross join unnest(array['invoice-quotation','invoice_quotation.create_quotation','invoice_quotation.create_invoice','invoice_quotation.pdf_export','invoice_quotation.custom_branding']) c on conflict do nothing;
-- Commercial limits remain configurable; no unvalidated price or quota is imposed.
create table public.iq_customers(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 120),company_name text not null default '' check(length(company_name)<=120),
 email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=40),
 address text not null default '' check(length(address)<=1000),tax_identifier text not null default '' check(length(tax_identifier)<=80),
 notes text not null default '' check(length(notes)<=2000),archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id));
create table public.iq_catalog_items(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 120),description text not null default '' check(length(description)<=2000),
 type text not null default 'service' check(type in('product','service')),unit text not null default '' check(length(unit)<=30),
 default_price numeric(18,2) not null default 0 check(default_price between 0 and 999999999999),currency text not null default 'IDR' check(currency='IDR'),
 archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id));
create table public.iq_settings(workspace_id uuid primary key references public.workspaces(id),payload jsonb not null default '{}',updated_at timestamptz not null default now(),check(octet_length(payload::text)<=2900000));
create table public.iq_documents(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 document_type text not null check(document_type in('quotation','invoice')),document_number text,
 lifecycle_status text not null default 'draft' check(lifecycle_status in('draft','issued','accepted','rejected','cancelled','void')),
 customer_id uuid not null,source_document_id uuid,
 issue_date date not null,valid_until date,due_date date,currency text not null default 'IDR' check(currency='IDR'),
 issuer_snapshot jsonb not null default '{}',customer_snapshot jsonb not null default '{}',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0),discount_total numeric(18,2) not null default 0 check(discount_total>=0),
 tax_total numeric(18,2) not null default 0 check(tax_total>=0),grand_total numeric(18,2) not null default 0 check(grand_total>=0),
 discount_rate numeric(5,2) not null default 0 check(discount_rate between 0 and 100),tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100),
 notes text not null default '' check(length(notes)<=4000),terms text not null default '' check(length(terms)<=4000),payment_instructions text not null default '' check(length(payment_instructions)<=2000),
 issued_at timestamptz,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version integer not null default 1,
 unique(workspace_id,id),unique(workspace_id,document_type,document_number),
 foreign key(workspace_id,customer_id) references public.iq_customers(workspace_id,id),
 foreign key(workspace_id,source_document_id) references public.iq_documents(workspace_id,id),
 check((document_type='invoice' and lifecycle_status in('draft','issued','void')) or (document_type='quotation' and lifecycle_status in('draft','issued','accepted','rejected','cancelled'))),
 check((lifecycle_status='draft' and document_number is null and issued_at is null) or (lifecycle_status<>'draft' and document_number is not null and issued_at is not null)));
create unique index iq_one_conversion on public.iq_documents(workspace_id,source_document_id) where source_document_id is not null;
create index iq_documents_list on public.iq_documents(workspace_id,document_type,created_at desc);
create index iq_customers_list on public.iq_customers(workspace_id,lower(name));
create table public.iq_document_items(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,document_id uuid not null,position integer not null,
 description text not null check(length(trim(description)) between 1 and 2000),quantity numeric(12,3) not null check(quantity>0 and quantity<=999999),unit text not null default '' check(length(unit)<=30),
 unit_price numeric(18,2) not null check(unit_price between 0 and 999999999999),discount_rate numeric(5,2) not null default 0 check(discount_rate between 0 and 100),
 line_subtotal numeric(18,2) not null check(line_subtotal>=0),line_discount numeric(18,2) not null check(line_discount>=0),line_total numeric(18,2) not null check(line_total>=0),
 foreign key(workspace_id,document_id) references public.iq_documents(workspace_id,id),unique(document_id,position));
create table public.iq_payments(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,invoice_id uuid not null,amount numeric(18,2) not null check(amount>0),
 payment_date date not null,method text not null check(method in('bank','cash','qris','wallet','other')),reference text not null default '' check(length(reference)<=120),notes text not null default '' check(length(notes)<=1000),
 idempotency_key uuid not null,recorded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),reversed_at timestamptz,reversed_by uuid references auth.users(id),reversal_reason text check(length(reversal_reason) between 3 and 1000),
 foreign key(workspace_id,invoice_id) references public.iq_documents(workspace_id,id),unique(workspace_id,idempotency_key));
create index iq_payments_document on public.iq_payments(workspace_id,invoice_id);
create table public.iq_document_sequences(workspace_id uuid not null references public.workspaces(id),document_type text not null,prefix text not null,year integer not null,last_sequence integer not null check(last_sequence>0),primary key(workspace_id,document_type,prefix,year));
create table public.iq_document_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),document_id uuid,actor_id uuid not null references auth.users(id),event text not null,details jsonb not null default '{}',created_at timestamptz not null default now(),foreign key(workspace_id,document_id) references public.iq_documents(workspace_id,id));
create index iq_events_time on public.iq_document_events(workspace_id,created_at desc);
-- All mutations go through authorized domain functions; membership alone never grants writes.
do $$declare t text;begin foreach t in array array['iq_customers','iq_catalog_items','iq_settings','iq_documents','iq_document_items','iq_payments','iq_document_sequences','iq_document_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id))',t);
 -- Workspaces RLS already restricts this subquery to owner/members.
 execute format('grant select on public.%I to authenticated',t);
 end loop;end$$;
create function public.iq_access(w uuid,cap text default null,writing boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;e record;begin
 a:=public.platform_access(w,'invoice-quotation');
 if not coalesce((a->>'enabled')::boolean,false) or public.workspace_role(w) is null then raise exception 'ACCESS_BLOCKED' using errcode='42501';end if;
 if writing and public.workspace_role(w) not in('owner','editor') then raise exception 'READ_ONLY' using errcode='42501';end if;
 if cap is not null then select * into e from public.plan_entitlements where plan_id=a->>'plan' and capability=cap;
 if not coalesce(e.enabled,false) then raise exception 'PLAN_REQUIRED' using errcode='42501';end if;
 a:=a||jsonb_build_object('feature_limit',e.monthly_limit);end if;return a;end;$$;
revoke all on function public.iq_access(uuid,text,boolean) from public,anon,authenticated;
-- Exact NUMERIC arithmetic. Round each base, line discount, document discount and tax to whole IDR.
create function public.iq_calculate(items jsonb,discount_rate numeric,tax_rate numeric) returns jsonb language plpgsql immutable set search_path='' as $$
declare i jsonb;lines jsonb:='[]';base numeric;disc numeric;net numeric;sub numeric:=0;dd numeric;tx numeric;q numeric;p numeric;r numeric;begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 100 or discount_rate is null or tax_rate is null or discount_rate not between 0 and 100 or tax_rate not between 0 and 100 then raise exception 'INVALID_INPUT';end if;
 for i in select value from jsonb_array_elements(items) loop
 if coalesce(length(trim(i->>'description')),0) not between 1 and 2000 or length(coalesce(i->>'unit',''))>30 or coalesce(i->>'quantity','') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' or coalesce(i->>'unit_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' or coalesce(i->>'discount_rate','0') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'INVALID_INPUT';end if;
 q:=(i->>'quantity')::numeric;p:=(i->>'unit_price')::numeric;r:=coalesce((i->>'discount_rate')::numeric,0);
 if q<=0 or r not between 0 and 100 then raise exception 'INVALID_INPUT';end if;
 base:=round(q*p);disc:=round(base*r/100);net:=base-disc;sub:=sub+net;
 lines:=lines||jsonb_build_array(jsonb_build_object('description',trim(i->>'description'),'quantity',q,'unit_price',p,'unit',coalesce(i->>'unit',''),'discount_rate',r,'line_subtotal',base,'line_discount',disc,'line_total',net));end loop;
 dd:=round(sub*discount_rate/100);tx:=round((sub-dd)*tax_rate/100);
 if sub-dd+tx>999999999999999 then raise exception 'AMOUNT_TOO_LARGE';end if;
 return jsonb_build_object('items',lines,'subtotal',sub,'discount_total',dd,'tax_total',tx,'grand_total',sub-dd+tx);end;$$;
revoke all on function public.iq_calculate(jsonb,numeric,numeric) from public,anon;
grant execute on function public.iq_calculate(jsonb,numeric,numeric) to authenticated;
create function public.iq_read(w uuid,section text default 'overview',q text default '',page integer default 0,doc uuid default null,filter text default 'all') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;result jsonb;today date;paid numeric;summary jsonb;status text;begin
 a:=public.iq_access(w);if page not between 0 and 100000 or length(q)>120 then raise exception 'INVALID_INPUT';end if;
 select (now() at time zone timezone)::date into today from public.workspaces where id=w;
 if doc is not null then
 select coalesce(sum(amount),0) into paid from public.iq_payments where workspace_id=w and invoice_id=doc and reversed_at is null;
 select case when d.document_type='quotation' and d.lifecycle_status='issued' and d.valid_until<today then 'expired' when d.lifecycle_status<>'issued' or d.document_type='quotation' then d.lifecycle_status when paid>=d.grand_total then 'paid' when d.due_date<today then 'overdue' when paid>0 then 'partially_paid' else 'unpaid' end into status from public.iq_documents d where d.workspace_id=w and d.id=doc;
 select to_jsonb(d)||jsonb_build_object('amount_paid',paid,'amount_due',greatest(d.grand_total-paid,0),'display_status',status,'items',(select coalesce(jsonb_agg(i order by i.position),'[]') from public.iq_document_items i where i.document_id=d.id),'payments',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.iq_payments p where p.invoice_id=d.id),'events',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]') from public.iq_document_events e where e.document_id=d.id),'linked_invoice',(select id from public.iq_documents where source_document_id=d.id)) into result from public.iq_documents d where d.workspace_id=w and d.id=doc;
 if result is null then raise exception 'NOT_FOUND' using errcode='42501';end if;return result;end if;
 if section='customers' then select coalesce(jsonb_agg(r),'[]') into result from(select * from public.iq_customers where workspace_id=w and not archived and (name ilike '%'||q||'%' or company_name ilike '%'||q||'%') order by name,id limit 25 offset page*25)r;
 elsif section='items' then select coalesce(jsonb_agg(r),'[]') into result from(select * from public.iq_catalog_items where workspace_id=w and not archived and (name ilike '%'||q||'%' or description ilike '%'||q||'%') order by name,id limit 25 offset page*25)r;
 else
 select coalesce(jsonb_agg(r),'[]') into result from(
 select d.*,coalesce(p.paid,0) amount_paid,d.grand_total-coalesce(p.paid,0) amount_due,
 case when d.document_type='quotation' and d.lifecycle_status='issued' and d.valid_until<today then 'expired' when d.lifecycle_status<>'issued' or d.document_type='quotation' then d.lifecycle_status when coalesce(p.paid,0)>=d.grand_total then 'paid' when d.due_date<today then 'overdue' when coalesce(p.paid,0)>0 then 'partially_paid' else 'unpaid' end display_status
 from public.iq_documents d left join lateral(select sum(amount) paid from public.iq_payments where invoice_id=d.id and reversed_at is null)p on true
 where d.workspace_id=w and (section not in('quotations','invoices') or d.document_type=case section when 'quotations' then 'quotation' else 'invoice' end)
 and (coalesce(d.document_number,'') ilike '%'||q||'%' or d.customer_snapshot->>'name' ilike '%'||q||'%' or d.customer_snapshot->>'company_name' ilike '%'||q||'%' or exists(select 1 from public.iq_document_items i where i.document_id=d.id and i.description ilike '%'||q||'%'))
 )r where filter='all' or r.display_status=filter or (filter='unpaid' and r.lifecycle_status='issued' and r.amount_paid=0 and r.amount_due>0) or (filter='partially_paid' and r.lifecycle_status='issued' and r.amount_paid>0 and r.amount_due>0);
 -- Apply filtering before pagination; never send unlimited rows.
 select coalesce(jsonb_agg(value),'[]') into result from(select value from jsonb_array_elements(result) order by value->>'created_at' desc,value->>'id' limit 25 offset page*25)s;
 end if;
 select jsonb_build_object('draft_quotations',count(*) filter(where d.document_type='quotation' and d.lifecycle_status='draft'),'open_quotations',count(*) filter(where d.document_type='quotation' and d.lifecycle_status='issued' and (d.valid_until is null or d.valid_until>=today)),'unpaid_invoices',count(*) filter(where d.document_type='invoice' and d.lifecycle_status='issued' and d.grand_total>coalesce(p.paid,0)),'paid_invoices',count(*) filter(where d.document_type='invoice' and d.lifecycle_status='issued' and d.grand_total<=coalesce(p.paid,0))) into summary from public.iq_documents d left join lateral(select sum(amount) paid from public.iq_payments where invoice_id=d.id and reversed_at is null)p on true where d.workspace_id=w;
 return jsonb_build_object('rows',result,'overview',summary,'page',page,'today',today,'access',a,'role',public.workspace_role(w),'settings',coalesce((select payload from public.iq_settings where workspace_id=w),jsonb_build_object('name',(select name from public.workspaces where id=w),'quotation_days',14,'due_days',14,'quotation_prefix','QT','invoice_prefix','INV')));
end;$$;
revoke all on function public.iq_read(uuid,text,text,integer,uuid,text) from public,anon;
grant execute on function public.iq_read(uuid,text,text,integer,uuid,text) to authenticated;
create function public.iq_action(w uuid,action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();a jsonb;d public.iq_documents;c public.iq_customers;pay public.iq_payments;s jsonb;t jsonb;i jsonb;target uuid;today date;series_prefix text;seq integer;doc_year integer;paid numeric;lim integer;used integer;evt text;line_idx integer:=0;begin
 a:=public.iq_access(w,null,true);
 -- Shared account quotas and workspace numbering are serialized consistently.
 perform pg_advisory_xact_lock(hashtext('iq-user:'||u::text));
 perform pg_advisory_xact_lock(hashtext('iq-workspace:'||w::text));
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>2900000 then raise exception 'INVALID_INPUT';end if;
 if (select count(*) from public.iq_document_events where actor_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT';end if;
 select (now() at time zone timezone)::date into today from public.workspaces where id=w;
 select payload into s from public.iq_settings where workspace_id=w;s:=coalesce(s,jsonb_build_object('name',(select name from public.workspaces where id=w)));
 target:=nullif(p->>'id','')::uuid;
 if action='customer' then
 if target is not null and not exists(select 1 from public.iq_customers where id=target and workspace_id=w) then raise exception 'NOT_FOUND' using errcode='42501';end if;
 target:=coalesce(target,gen_random_uuid());
 insert into public.iq_customers(id,workspace_id,name,company_name,email,phone,address,tax_identifier,notes,archived)
 values(target,w,trim(p->>'name'),coalesce(p->>'company_name',''),coalesce(p->>'email',''),coalesce(p->>'phone',''),coalesce(p->>'address',''),coalesce(p->>'tax_identifier',''),coalesce(p->>'notes',''),coalesce((p->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,company_name=excluded.company_name,email=excluded.email,phone=excluded.phone,address=excluded.address,tax_identifier=excluded.tax_identifier,notes=excluded.notes,archived=excluded.archived,updated_at=now();evt:='iq_customer_saved';
 elsif action='item' then
 if target is not null and not exists(select 1 from public.iq_catalog_items where id=target and workspace_id=w) then raise exception 'NOT_FOUND' using errcode='42501';end if;
 target:=coalesce(target,gen_random_uuid());
 insert into public.iq_catalog_items(id,workspace_id,name,description,type,unit,default_price,archived) values(target,w,p->>'name',coalesce(p->>'description',''),coalesce(p->>'type','service'),coalesce(p->>'unit',''),(p->>'default_price')::numeric,coalesce((p->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,description=excluded.description,type=excluded.type,unit=excluded.unit,default_price=excluded.default_price,archived=excluded.archived,updated_at=now();evt:='iq_item_saved';
 elsif action='settings' then
 if public.workspace_role(w)<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;
 if coalesce(length(trim(p->>'name')),0) not between 1 and 120 or length(coalesce(p->>'address',''))>1000 or length(coalesce(p->>'email',''))>254 or length(coalesce(p->>'phone',''))>40 or length(coalesce(p->>'notes',''))>4000 or length(coalesce(p->>'terms',''))>4000 or length(coalesce(p->>'payment_instructions',''))>2000 or coalesce(p->>'quotation_prefix','QT') !~ '^[A-Z0-9]{1,8}$' or coalesce(p->>'invoice_prefix','INV') !~ '^[A-Z0-9]{1,8}$' or coalesce((p->>'quotation_days')::integer,14) not between 0 and 365 or coalesce((p->>'due_days')::integer,14) not between 0 and 365 then raise exception 'INVALID_INPUT';end if;
 if p->>'logo' is not null and p->>'logo'<>'' and (length(p->>'logo')>2800000 or p->>'logo' !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then raise exception 'INVALID_LOGO';end if;
 t:=jsonb_build_object('name',trim(p->>'name'),'address',coalesce(p->>'address',''),'email',coalesce(p->>'email',''),'phone',coalesce(p->>'phone',''),'notes',coalesce(p->>'notes',''),'terms',coalesce(p->>'terms',''),'payment_instructions',coalesce(p->>'payment_instructions',''),'quotation_prefix',coalesce(p->>'quotation_prefix','QT'),'invoice_prefix',coalesce(p->>'invoice_prefix','INV'),'quotation_days',coalesce((p->>'quotation_days')::integer,14),'due_days',coalesce((p->>'due_days')::integer,14),'logo',coalesce(p->>'logo',''));
 insert into public.iq_settings(workspace_id,payload) values(w,t) on conflict(workspace_id) do update set payload=excluded.payload,updated_at=now();evt:='iq_settings_saved';
 elsif action='draft' then
 if p->>'document_type' not in('quotation','invoice') then raise exception 'INVALID_INPUT';end if;
 perform public.iq_access(w,'invoice_quotation.create_'||(p->>'document_type'),true);
 select * into c from public.iq_customers where id=(p->>'customer_id')::uuid and workspace_id=w and not archived;
 if not found then raise exception 'INVALID_CUSTOMER';end if;
 t:=public.iq_calculate(p->'items',coalesce((p->>'discount_rate')::numeric,0),coalesce((p->>'tax_rate')::numeric,0));
 if target is not null then select * into d from public.iq_documents where id=target and workspace_id=w for update;
 if not found then raise exception 'NOT_FOUND' using errcode='42501';end if;
 if d.lifecycle_status<>'draft' or d.document_type<>p->>'document_type' then raise exception 'IMMUTABLE_DOCUMENT';end if;
 if d.version is distinct from (p->>'version')::integer then raise exception 'VERSION_CONFLICT';end if;
 else target:=gen_random_uuid();
 insert into public.iq_documents(id,workspace_id,document_type,customer_id,issue_date,created_by) values(target,w,p->>'document_type',c.id,coalesce((p->>'issue_date')::date,today),u);end if;
 update public.iq_documents set customer_id=c.id,customer_snapshot=to_jsonb(c)-'workspace_id'-'notes',issuer_snapshot=s,
 issue_date=coalesce((p->>'issue_date')::date,today),valid_until=case when d.document_type='quotation' then coalesce(nullif(p->>'valid_until','')::date,coalesce((p->>'issue_date')::date,today)+coalesce((s->>'quotation_days')::integer,14)) else null end,due_date=case when d.document_type='invoice' then coalesce(nullif(p->>'due_date','')::date,coalesce((p->>'issue_date')::date,today)+coalesce((s->>'due_days')::integer,14)) else null end,
 subtotal=(t->>'subtotal')::numeric,discount_total=(t->>'discount_total')::numeric,tax_total=(t->>'tax_total')::numeric,grand_total=(t->>'grand_total')::numeric,
 discount_rate=coalesce((p->>'discount_rate')::numeric,0),tax_rate=coalesce((p->>'tax_rate')::numeric,0),notes=coalesce(p->>'notes',''),terms=coalesce(p->>'terms',''),payment_instructions=coalesce(p->>'payment_instructions',''),version=version+1,updated_at=now() where id=target;
 delete from public.iq_document_items where document_id=target;
 for i in select value from jsonb_array_elements(t->'items') loop
 insert into public.iq_document_items(workspace_id,document_id,position,description,quantity,unit,unit_price,discount_rate,line_subtotal,line_discount,line_total) values(w,target,line_idx,i->>'description',(i->>'quantity')::numeric,i->>'unit',(i->>'unit_price')::numeric,(i->>'discount_rate')::numeric,(i->>'line_subtotal')::numeric,(i->>'line_discount')::numeric,(i->>'line_total')::numeric);line_idx:=line_idx+1;end loop;evt:='iq_draft_saved';
 else
 select * into d from public.iq_documents where id=target and workspace_id=w for update;
 if not found then raise exception 'NOT_FOUND' using errcode='42501';end if;
 if action='issue' then
 if d.lifecycle_status<>'draft' then return public.iq_read(w,doc=>d.id);end if;
 if d.version is distinct from (p->>'version')::integer then raise exception 'VERSION_CONFLICT';end if;
 a:=public.iq_access(w,'invoice_quotation.create_'||d.document_type,true);lim:=(a->>'feature_limit')::integer;
 select count(*) into used from public.usage_events where user_id=u and app_id='invoice-quotation' and metric=d.document_type||'_issued' and created_at>=date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
 if lim is not null and used>=lim then raise exception 'USAGE_LIMIT';end if;
 -- Overall app limit counts only issuance, never PDF downloads or draft saves.
 select count(*) into used from public.usage_events where user_id=u and app_id='invoice-quotation' and metric in('quotation_issued','invoice_issued') and created_at>=date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
 if a->>'monthly_limit' is not null and used>=(a->>'monthly_limit')::integer then raise exception 'USAGE_LIMIT';end if;
 if d.valid_until<d.issue_date or d.due_date<d.issue_date then raise exception 'INVALID_DATE';end if;
 if d.source_document_id is null then
 select * into c from public.iq_customers where id=d.customer_id and workspace_id=w and not archived;if not found then raise exception 'INVALID_CUSTOMER';end if;
 update public.iq_documents set customer_snapshot=to_jsonb(c)-'workspace_id'-'notes',issuer_snapshot=s where id=d.id;
 end if;
 series_prefix:=coalesce(s->>case d.document_type when 'quotation' then 'quotation_prefix' else 'invoice_prefix' end,case d.document_type when 'quotation' then 'QT' else 'INV' end);doc_year:=extract(year from d.issue_date);
 insert into public.iq_document_sequences(workspace_id,document_type,prefix,year,last_sequence) values(w,d.document_type,series_prefix,doc_year,1) on conflict(workspace_id,document_type,prefix,year) do update set last_sequence=public.iq_document_sequences.last_sequence+1 returning last_sequence into seq;
 update public.iq_documents set document_number=series_prefix||'-'||doc_year::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),lifecycle_status='issued',issued_at=now(),version=version+1,updated_at=now() where id=d.id;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(u,w,'invoice-quotation',d.document_type||'_issued');evt:='iq_'||d.document_type||'_issued';
 elsif action in('accept','reject','cancel','void') then
 if d.lifecycle_status=(case action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'cancel' then 'cancelled' else 'void' end) then return public.iq_read(w,doc=>d.id);end if;
 if d.lifecycle_status<>'issued' or (d.document_type='invoice' and action<>'void') or (d.document_type='quotation' and action='void') then raise exception 'INVALID_TRANSITION';end if;
 if action='accept' and d.valid_until<today then raise exception 'EXPIRED_QUOTATION';end if;
 if action='void' and exists(select 1 from public.iq_payments where invoice_id=d.id and reversed_at is null) then raise exception 'REVERSE_PAYMENTS_FIRST';end if;
 update public.iq_documents set lifecycle_status=case action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'cancel' then 'cancelled' else 'void' end,version=version+1,updated_at=now() where id=d.id;evt:='iq_'||action||'_recorded';
 elsif action='convert' then
 perform public.iq_access(w,'invoice_quotation.create_invoice',true);
 if d.document_type<>'quotation' or d.lifecycle_status<>'accepted' then raise exception 'ACCEPTED_REQUIRED';end if;
 select id into target from public.iq_documents where workspace_id=w and source_document_id=d.id;
 if target is not null then return public.iq_read(w,doc=>target);end if;
 target:=gen_random_uuid();
 insert into public.iq_documents(id,workspace_id,document_type,customer_id,source_document_id,issue_date,due_date,issuer_snapshot,customer_snapshot,subtotal,discount_total,tax_total,grand_total,discount_rate,tax_rate,notes,terms,payment_instructions,created_by)
 values(target,w,'invoice',d.customer_id,d.id,today,today+coalesce((s->>'due_days')::integer,14),d.issuer_snapshot,d.customer_snapshot,d.subtotal,d.discount_total,d.tax_total,d.grand_total,d.discount_rate,d.tax_rate,d.notes,d.terms,coalesce(s->>'payment_instructions',''),u);
 insert into public.iq_document_items(workspace_id,document_id,position,description,quantity,unit,unit_price,discount_rate,line_subtotal,line_discount,line_total) select w,target,row_number() over(order by source.position)-1,source.description,source.quantity,source.unit,source.unit_price,source.discount_rate,source.line_subtotal,source.line_discount,source.line_total from public.iq_document_items source where source.document_id=d.id;evt:='iq_quotation_converted';
 elsif action='payment' then
 select * into pay from public.iq_payments where workspace_id=w and idempotency_key=(p->>'idempotency_key')::uuid;
 if found then if pay.invoice_id<>d.id or pay.amount<>(p->>'amount')::numeric then raise exception 'IDEMPOTENCY_CONFLICT';end if;return public.iq_read(w,doc=>d.id);end if;
 if d.document_type<>'invoice' or d.lifecycle_status<>'issued' then raise exception 'INVALID_TRANSITION';end if;
 select coalesce(sum(amount),0) into paid from public.iq_payments where invoice_id=d.id and reversed_at is null;
 if (p->>'amount')::numeric> d.grand_total-paid or (p->>'amount')::numeric<>round((p->>'amount')::numeric) then raise exception 'OVERPAYMENT';end if;
 if (p->>'payment_date')::date>today then raise exception 'INVALID_DATE';end if;
 insert into public.iq_payments(workspace_id,invoice_id,amount,payment_date,method,reference,notes,idempotency_key,recorded_by) values(w,d.id,(p->>'amount')::numeric,(p->>'payment_date')::date,p->>'method',coalesce(p->>'reference',''),coalesce(p->>'notes',''),(p->>'idempotency_key')::uuid,u);evt:='iq_payment_recorded';
 elsif action='reverse' then
 if coalesce(length(trim(p->>'reason')),0) not between 3 and 1000 then raise exception 'REASON_REQUIRED';end if;
 update public.iq_payments set reversed_at=now(),reversed_by=u,reversal_reason=trim(p->>'reason') where id=(p->>'payment_id')::uuid and invoice_id=d.id and workspace_id=w and reversed_at is null;
 if not found then raise exception 'PAYMENT_NOT_ACTIVE';end if;evt:='iq_payment_reversed';
 else raise exception 'INVALID_ACTION';end if;
 end if;
 insert into public.iq_document_events(workspace_id,document_id,actor_id,event) values(w,case when action in('customer','item','settings') then null else target end,u,evt);
 if evt in('iq_draft_saved','iq_quotation_issued','iq_invoice_issued','iq_accept_recorded','iq_reject_recorded','iq_cancel_recorded','iq_void_recorded','iq_quotation_converted','iq_payment_recorded','iq_payment_reversed') then insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'invoice-quotation','tool_value_completed');end if;
 if action in('customer','item','settings') then return jsonb_build_object('id',target);end if;
 return public.iq_read(w,doc=>target);
end;$$;
revoke all on function public.iq_action(uuid,text,jsonb) from public,anon;
grant execute on function public.iq_action(uuid,text,jsonb) to authenticated;
commit;
