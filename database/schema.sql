-- PRCUISA Hub MVP. Apply once to a dedicated Supabase project.
-- Single-owner workspaces in MVP; membership supports explicitly granted future access.
begin;
create table public.workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 2 and 80),
 currency text not null default 'IDR' check(currency='IDR'),
 timezone text not null default 'Asia/Jakarta' check(timezone='Asia/Jakarta'),
 created_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces(owner_id);
create table public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('editor','viewer')),
 primary key(workspace_id,user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id,workspace_id);
create table public.transactions (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 kind text not null check(kind in ('revenue','expense')),
 amount bigint not null check(amount>0 and amount<=1000000000000),
 category text not null default 'Lainnya' check(char_length(category)<=60),
 description text not null default '' check(char_length(description)<=240),
 date date not null default (now() at time zone 'Asia/Jakarta')::date,
 created_at timestamptz not null default now()
);
create index transactions_workspace_date_idx on public.transactions(workspace_id,date desc,created_at desc);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 name text not null check(name in ('workspace_created','workspace_updated','revenue_recorded','expense_recorded','workspace_opened','upgrade_intent')),
 transaction_id uuid references public.transactions(id),
 created_at timestamptz not null default now()
);
create index events_workspace_created_idx on public.activity_events(workspace_id,created_at desc);
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.transactions enable row level security;
alter table public.activity_events enable row level security;
-- Membership is provisioned by trusted administrators only in MVP. Users cannot grant access.
create policy members_read_self on public.workspace_members for select to authenticated using(user_id=(select auth.uid()));
create policy workspaces_read on public.workspaces for select to authenticated using(owner_id=(select auth.uid()) or id in (select workspace_id from public.workspace_members where user_id=(select auth.uid())));
create policy workspaces_create on public.workspaces for insert to authenticated with check(owner_id=(select auth.uid()));
create policy workspaces_rename on public.workspaces for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy transactions_read on public.transactions for select to authenticated using(workspace_id in (select id from public.workspaces));
create policy transactions_create on public.transactions for insert to authenticated with check(created_by=(select auth.uid()) and (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())) or exists(select 1 from public.workspace_members m where m.workspace_id=transactions.workspace_id and m.user_id=(select auth.uid()) and m.role='editor')));
create policy activity_read on public.activity_events for select to authenticated using(workspace_id in (select id from public.workspaces));
create policy activity_create on public.activity_events for insert to authenticated with check(user_id=(select auth.uid()) and workspace_id in (select id from public.workspaces));
revoke all on public.workspaces, public.workspace_members, public.transactions, public.activity_events from anon,authenticated;
grant select,insert on public.workspaces to authenticated;
grant update(name) on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select,insert on public.transactions to authenticated;
grant select,insert on public.activity_events to authenticated;
-- No transaction update/delete privileges: history is append-only in this narrow MVP.
-- Triggers use invoker privileges so normal RLS applies to their inserts.
create function public.record_workspace_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.activity_events(workspace_id,user_id,name) values(new.id,auth.uid(),case when TG_OP='INSERT' then 'workspace_created' else 'workspace_updated' end);
 return new;
end;$$;
create trigger workspace_event after insert or update on public.workspaces for each row execute function public.record_workspace_event();
create function public.record_transaction_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.activity_events(workspace_id,user_id,name,transaction_id) values(new.workspace_id,auth.uid(),new.kind||'_recorded',new.id);
 return new;
end;$$;
create trigger transaction_event after insert on public.transactions for each row execute function public.record_transaction_event();
revoke execute on function public.record_workspace_event(),public.record_transaction_event() from public,anon,authenticated;
create function public.business_summary(p_workspace uuid,p_start date,p_end date,p_previous_start date,p_previous_end date) returns jsonb language sql stable security invoker set search_path='' as $$
 with current_rows as (select * from public.transactions where workspace_id=p_workspace and date between p_start and p_end),
 sums as (select coalesce(sum(amount) filter(where kind='revenue'),0) as revenue,coalesce(sum(amount) filter(where kind='expense'),0) as expense,count(*) as count from current_rows),
 largest as (select category,sum(amount) as amount from current_rows where kind='expense' group by category order by amount desc,category limit 1),
 previous as (select coalesce(sum(amount) filter(where kind='revenue'),0) as revenue,count(*) as count from public.transactions where workspace_id=p_workspace and date between p_previous_start and p_previous_end)
 select jsonb_build_object('revenue',sums.revenue,'expense',sums.expense,'count',sums.count,'largest_category',(select category from largest),'largest_amount',coalesce((select amount from largest),0),'previous_revenue',previous.revenue,'previous_count',previous.count) from sums,previous;
$$;
revoke execute on function public.business_summary(uuid,date,date,date,date) from public,anon;
grant execute on function public.business_summary(uuid,date,date,date,date) to authenticated;
commit;

-- Direction update: metadata and evidence-based contextual previews. No destructive changes.
begin;
alter table public.workspaces add column business_type text not null default 'Lainnya' check(char_length(business_type) between 1 and 60);
alter table public.workspaces add column primary_goal text not null default 'Belum tahu, saya mau coba dulu' check(primary_goal in ('Pemasukan & pengeluaran','Laporan bisnis','Pekerjaan berulang','Customer service','Belum tahu, saya mau coba dulu'));
create or replace function public.business_summary(p_workspace uuid,p_start date,p_end date,p_previous_start date,p_previous_end date) returns jsonb language sql stable security invoker set search_path='' as $$
 with current_rows as (select * from public.transactions where workspace_id=p_workspace and date between p_start and p_end),
 sums as (select coalesce(sum(amount) filter(where kind='revenue'),0) as revenue,coalesce(sum(amount) filter(where kind='expense'),0) as expense,count(*) as count,coalesce(max(amount) filter(where kind='revenue'),0) as largest_revenue,coalesce(max(amount) filter(where kind='expense'),0) as largest_expense from current_rows),
 largest as (select category,sum(amount) as amount from current_rows where kind='expense' group by category order by amount desc,category limit 1),
 previous as (select coalesce(sum(amount) filter(where kind='revenue'),0) as revenue,count(*) as count from public.transactions where workspace_id=p_workspace and date between p_previous_start and p_previous_end)
 select jsonb_build_object('revenue',sums.revenue,'expense',sums.expense,'count',sums.count,'largest_revenue',sums.largest_revenue,'largest_expense',sums.largest_expense,'largest_category',(select category from largest),'largest_amount',coalesce((select amount from largest),0),'previous_revenue',previous.revenue,'previous_count',previous.count) from sums,previous;
$$;

create function public.business_usage(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('record_count',count(*),'active_days',count(distinct date),'recent_count',count(*) filter(where date >= (now() at time zone 'Asia/Jakarta')::date - 6))
 from public.transactions where workspace_id=p_workspace and date <= (now() at time zone 'Asia/Jakarta')::date;
$$;
revoke execute on function public.business_usage(uuid) from public,anon;
grant execute on function public.business_usage(uuid) to authenticated;
commit;

begin;
-- Authoritative catalog and capability configuration; no client writes.
create table public.app_categories (id text primary key);
create table public.apps (
 slug text primary key, name text not null, description text not null,
 category text not null references public.app_categories(id), icon text not null,
 launch_url text, status text not null check(status in ('active','beta','coming_soon','deprecated','private')),
 access_type text not null check(access_type in ('free','included','limited','business','internal')),
 minimum_plan text, is_featured boolean not null default false, is_public boolean not null default true,
 keywords text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.plans(id text primary key check(id in ('free','pro','business')),name text not null);
insert into public.plans values('free','Free'),('pro','Pro'),('business','Business');
create table public.plan_entitlements(plan_id text references public.plans(id),capability text not null,enabled boolean not null default false,monthly_limit integer check(monthly_limit>=0),primary key(plan_id,capability));
insert into public.plan_entitlements select id,capability,true,null from public.plans cross join (values('business-report'),('qr')) as c(capability);
create table public.subscriptions(user_id uuid primary key references auth.users(id) on delete cascade,plan_id text not null references public.plans(id),status text not null check(status in ('active','trialing','cancelled','past_due')),current_period_end timestamptz,updated_at timestamptz not null default now());
create table public.workspace_apps(user_id uuid references auth.users(id) on delete cascade,workspace_id uuid references public.workspaces(id) on delete cascade,app_id text references public.apps(slug),favorite boolean not null default false,last_opened_at timestamptz,primary key(user_id,workspace_id,app_id));
create table public.platform_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),workspace_id uuid not null references public.workspaces(id) on delete cascade,app_id text references public.apps(slug),name text not null check(name in ('hub_viewed','tool_opened','second_tool_opened','tool_favorited','tool_value_completed','tool_request_submitted','upgrade_viewed','upgrade_clicked','tool_searched')),created_at timestamptz not null default now());
create index platform_events_user_time on public.platform_events(user_id,created_at desc);
create index platform_events_workspace_time on public.platform_events(workspace_id,created_at desc);
create table public.usage_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),workspace_id uuid not null references public.workspaces(id) on delete cascade,app_id text not null references public.apps(slug),metric text not null default 'value_completed',quantity integer not null default 1 check(quantity>0),created_at timestamptz not null default now());
create index usage_user_app_time on public.usage_events(user_id,app_id,created_at);
create table public.request_groups(id uuid primary key default gen_random_uuid(),title text not null,notes text not null default '',created_at timestamptz not null default now());
create table public.tool_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),workspace_id uuid not null references public.workspaces(id) on delete cascade,problem text not null check(char_length(trim(problem)) between 10 and 2000),workflow text not null default '' check(char_length(workflow)<=2000),frequency text not null default '' check(char_length(frequency)<=80),status text not null default 'submitted' check(status in ('submitted','reviewing','planned','building','beta','released','declined')),group_id uuid references public.request_groups(id),created_at timestamptz not null default now());
create index requests_user_workspace_time on public.tool_requests(user_id,workspace_id,created_at desc);
-- RLS remains effective even if a client bypasses the application's API.
alter table public.app_categories enable row level security;
alter table public.apps enable row level security;
alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.workspace_apps enable row level security;
alter table public.platform_events enable row level security;
alter table public.usage_events enable row level security;
alter table public.tool_requests enable row level security;
alter table public.request_groups enable row level security;
create policy categories_read on public.app_categories for select to authenticated using(true);
create policy apps_read on public.apps for select to authenticated using(is_public and status<>'private');
create policy plans_read on public.plans for select to authenticated using(true);
create policy entitlements_read on public.plan_entitlements for select to authenticated using(true);
create policy subscription_self on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy workspace_apps_self on public.workspace_apps for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
create policy platform_events_self on public.platform_events for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
create policy usage_self on public.usage_events for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
create policy requests_self on public.tool_requests for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
revoke all on public.app_categories,public.apps,public.plans,public.plan_entitlements,public.subscriptions,public.workspace_apps,public.platform_events,public.usage_events,public.tool_requests,public.request_groups from public,anon,authenticated;
grant select on public.app_categories,public.apps,public.plans,public.plan_entitlements,public.subscriptions,public.workspace_apps,public.platform_events,public.usage_events,public.tool_requests to authenticated;
-- Only these narrow functions write platform records. A verified auth.uid and
-- membership are mandatory. No role or plan is read from user-editable metadata.
create function public.platform_access(p_workspace uuid,p_app text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); p text:='free'; e record; n bigint;
begin
 if u is null or not exists(select 1 from public.workspaces w where w.id=p_workspace and (w.owner_id=u or exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id=u))) then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 select s.plan_id into p from public.subscriptions s where s.user_id=u and s.status in('active','trialing') and (s.current_period_end is null or s.current_period_end>now());
 p:=coalesce(p,'free');
 select * into e from public.plan_entitlements where plan_id=p and capability=p_app;
 select coalesce(sum(quantity),0) into n from public.usage_events where user_id=u and app_id=p_app and created_at>=date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
 return jsonb_build_object('plan',p,'enabled',coalesce(e.enabled,false) and exists(select 1 from public.apps where slug=p_app and status in('active','beta') and is_public),'monthly_limit',e.monthly_limit,'used',n);
end;$$;
create function public.platform_action(p_workspace uuid,p_action text,p_app text default null,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a jsonb; rid uuid; n integer;
begin
 if u is null or not exists(select 1 from public.workspaces w where w.id=p_workspace and (w.owner_id=u or exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id=u))) then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT'; end if;
 if p_action in ('open','favorite','qr','value') then
  a:=public.platform_access(p_workspace,p_app);
  if not (a->>'enabled')::boolean then raise exception 'ACCESS_BLOCKED' using errcode='42501';end if;
  if p_action in('qr','value','open') and a->>'monthly_limit' is not null and (a->>'used')::bigint >= (a->>'monthly_limit')::bigint then raise exception 'USAGE_LIMIT';end if;
 end if;
 if p_action='open' then
  select count(*) into n from public.workspace_apps where user_id=u and workspace_id=p_workspace and last_opened_at is not null;
  if n=1 and not exists(select 1 from public.workspace_apps where user_id=u and workspace_id=p_workspace and app_id=p_app and last_opened_at is not null) then insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,p_app,'second_tool_opened');end if;
  insert into public.workspace_apps(user_id,workspace_id,app_id,last_opened_at) values(u,p_workspace,p_app,now()) on conflict(user_id,workspace_id,app_id) do update set last_opened_at=excluded.last_opened_at;
  insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,p_app,'tool_opened');
 elsif p_action='favorite' then
  insert into public.workspace_apps(user_id,workspace_id,app_id,favorite) values(u,p_workspace,p_app,coalesce((p_payload->>'favorite')::boolean,false)) on conflict(user_id,workspace_id,app_id) do update set favorite=excluded.favorite;
  insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,p_app,'tool_favorited');
 elsif p_action in('qr','value') then
  if (p_action='qr' and p_app<>'qr') or (p_action='value' and (p_app<>'business-report' or pg_trigger_depth()=0)) then raise exception 'INVALID_ACTION';end if;
  insert into public.usage_events(user_id,workspace_id,app_id) values(u,p_workspace,p_app);
  insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,p_app,'tool_value_completed');
 elsif p_action='request' then
  insert into public.tool_requests(user_id,workspace_id,problem,workflow,frequency) values(u,p_workspace,trim(p_payload->>'problem'),coalesce(p_payload->>'workflow',''),coalesce(p_payload->>'frequency','')) returning id into rid;
  insert into public.platform_events(user_id,workspace_id,name) values(u,p_workspace,'tool_request_submitted');
 elsif p_action in('hub_viewed','upgrade_viewed','upgrade_clicked','tool_searched') then
  insert into public.platform_events(user_id,workspace_id,name) values(u,p_workspace,p_action);
 else raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('ok',true,'id',rid);
end;$$;
revoke all on function public.platform_access(uuid,text),public.platform_action(uuid,text,text,jsonb) from public,anon;
grant execute on function public.platform_access(uuid,text),public.platform_action(uuid,text,text,jsonb) to authenticated;
create function public.record_platform_transaction() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.platform_action(new.workspace_id,'value','business-report');return new;
end;$$;
revoke all on function public.record_platform_transaction() from public,anon,authenticated;
create trigger platform_transaction after insert on public.transactions for each row execute function public.record_platform_transaction();
-- Identity preferences remain in existing verified Auth profile. Team invitations,
-- external OIDC, payment webhooks and integrations are deliberately separate phases.

insert into public.app_categories values('Bisnis'),('Utilitas'),('AI');
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords) values('business-report','Business Report','Catat pemasukan, pengeluaran, dan pahami hasil usaha.','Bisnis','report','/tools/business-report','active','free','free',true,true,'laporan bisnis pemasukan pengeluaran catat usaha uang');
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords) values('qr','QR Tools','Buat QR untuk tautan menu, katalog, atau toko kamu.','Utilitas','qr','/tools/qr','active','free','free',true,true,'buat qr kode menu katalog link tautan whatsapp');
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords) values('ai-assistant','Asisten Bisnis','Nantinya, tanya kondisi bisnis dari data yang kamu izinkan.','AI','assistant',null,'coming_soon','included',null,false,true,'asisten ai analisa data insight');
-- Preserve real historical usage when upgrading an existing Business Report installation.
insert into public.usage_events(user_id,workspace_id,app_id,created_at)
 select created_by,workspace_id,'business-report',created_at from public.transactions;
commit;

begin;
create table public.qr_designs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),
 design jsonb not null check(jsonb_typeof(design)='object' and jsonb_typeof(design->'fields')='object' and jsonb_typeof(design->'style')='object' and octet_length(design::text)<=450000),
 created_at timestamptz not null default now()
);
create index qr_designs_user_workspace_time on public.qr_designs(user_id,workspace_id,created_at desc);
alter table public.qr_designs enable row level security;
create policy qr_designs_read on public.qr_designs for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
revoke all on public.qr_designs from public,anon,authenticated;
grant select on public.qr_designs to authenticated;
-- Atomic entitlement/rate/quota validation and save; identity is never caller-supplied.
create function public.save_qr_design(p_workspace uuid,p_name text,p_design jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.qr_designs;
begin
 if p_design is null or p_design->>'type' is null or p_design->>'type' not in('url','text','email','phone','sms','whatsapp','wifi','vcard','location','event') then raise exception 'INVALID_DESIGN';end if;
 perform public.platform_action(p_workspace,'qr','qr');
 insert into public.qr_designs(user_id,workspace_id,name,design) values(auth.uid(),p_workspace,trim(p_name),p_design) returning * into result;
 return jsonb_build_object('id',result.id,'name',result.name,'design',result.design,'created_at',result.created_at);
end;$$;
revoke all on function public.save_qr_design(uuid,text,jsonb) from public,anon;
grant execute on function public.save_qr_design(uuid,text,jsonb) to authenticated;
update public.apps set description='Buat QR custom untuk tautan, WiFi, kontak, dan kebutuhan bisnis.',keywords='buat qr kode menu katalog link tautan whatsapp wifi kontak vcard email telepon sms lokasi event logo warna',updated_at=now() where slug='qr';
commit;

begin;

-- Prices stay unset until PRCUISA has approved the public plan pricing.
create table public.billing_plans (
  plan_id text primary key references public.plans(id),
  amount_idr bigint check (amount_idr is null or amount_idr > 0),
  period_days integer not null default 30 check (period_days between 1 and 3650),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_plans(plan_id, amount_idr, active)
values ('free', null, true), ('pro', null, false), ('business', null, false);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique check (order_id ~ '^PRC-[a-f0-9]{32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id text not null references public.billing_plans(plan_id),
  amount_idr bigint not null check (amount_idr > 0),
  period_days integer not null check (period_days between 1 and 3650),
  currency text not null default 'IDR' check (currency = 'IDR'),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','cancelled')),
  midtrans_transaction_id text,
  payment_method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_user_created on public.payments(user_id, created_at desc);
create index payments_pending_time on public.payments(created_at) where status = 'pending';
alter table public.billing_plans enable row level security;
alter table public.payments enable row level security;
create policy billing_plans_active_read on public.billing_plans
  for select to authenticated using (active);
create policy payment_owner_read on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.workspaces w where w.id = workspace_id
      and (w.owner_id = (select auth.uid()) or exists (
        select 1 from public.workspace_members m
        where m.workspace_id = w.id and m.user_id = (select auth.uid())
      ))
  ));
revoke all on public.billing_plans, public.payments from public, anon, authenticated;
grant select on public.billing_plans, public.payments to authenticated;

-- The caller chooses a plan and business, never a price or order ID.
create function public.create_midtrans_payment(p_workspace uuid, p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  selected_plan public.billing_plans;
  new_order text := 'PRC-' || replace(gen_random_uuid()::text, '-', '');
begin
  if u is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.workspaces w where w.id = p_workspace
      and (w.owner_id = u or exists (
        select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = u
      ))
  ) then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  select * into selected_plan from public.billing_plans
    where plan_id = p_plan and active and amount_idr is not null;
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  if (select count(*) from public.payments
      where user_id = u and status = 'pending' and created_at > now() - interval '1 hour') >= 10
    then raise exception 'PAYMENT_RATE_LIMIT'; end if;
  insert into public.payments(order_id,user_id,workspace_id,plan_id,amount_idr,period_days)
    values(new_order,u,p_workspace,selected_plan.plan_id,selected_plan.amount_idr,selected_plan.period_days);
  return jsonb_build_object('order_id',new_order,'plan_id',selected_plan.plan_id,'amount_idr',selected_plan.amount_idr);
end;
$$;
revoke all on function public.create_midtrans_payment(uuid,text) from public, anon;
grant execute on function public.create_midtrans_payment(uuid,text) to authenticated;

-- Called only by the server webhook after Midtrans's status API confirms the order.
create function public.apply_midtrans_notification(
  p_order_id text,
  p_amount_idr numeric,
  p_transaction_status text,
  p_fraud_status text,
  p_transaction_id text,
  p_payment_method text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  payment public.payments;
  period integer;
  grant_access boolean;
  new_status text;
begin
  select * into payment from public.payments where order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if payment.amount_idr::numeric <> p_amount_idr then raise exception 'AMOUNT_MISMATCH'; end if;
  if payment.status = 'paid' then return jsonb_build_object('ok',true,'status','paid','already_applied',true); end if;

  grant_access := p_transaction_status = 'settlement'
    or (p_transaction_status = 'capture' and coalesce(p_fraud_status, '') in ('', 'accept'));
  new_status := case
    when grant_access then 'paid'
    when p_transaction_status = 'expire' then 'expired'
    when p_transaction_status = 'cancel' then 'cancelled'
    when p_transaction_status in ('deny','failure') then 'failed'
    else 'pending'
  end;
  update public.payments set
    status = new_status,
    midtrans_transaction_id = coalesce(p_transaction_id, midtrans_transaction_id),
    payment_method = coalesce(p_payment_method, payment_method),
    paid_at = case when grant_access then coalesce(paid_at, now()) else paid_at end
    where id = payment.id and status = 'pending';

  if grant_access then
    period := payment.period_days;
    insert into public.subscriptions(user_id,plan_id,status,current_period_end,updated_at)
      values(payment.user_id,payment.plan_id,'active',now() + make_interval(days => period),now())
    on conflict(user_id) do update set
      plan_id = excluded.plan_id,
      status = 'active',
      current_period_end = case
        when public.subscriptions.plan_id = excluded.plan_id
          and public.subscriptions.current_period_end > now()
        then public.subscriptions.current_period_end + make_interval(days => period)
        else now() + make_interval(days => period)
      end,
      updated_at = now();
  end if;
  return jsonb_build_object('ok',true,'status',new_status,'already_applied',false);
end;
$$;
revoke all on function public.apply_midtrans_notification(text,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_midtrans_notification(text,numeric,text,text,text,text) to service_role;

commit;

begin;
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords)
values('invoice','Invoice','Buat, hitung, dan simpan invoice bisnis.','Bisnis','invoice','/tools/invoice','active','free','free',true,true,'invoice faktur tagihan buat invoice klien barang jasa pajak diskon')
on conflict(slug) do update set name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,launch_url=excluded.launch_url,status='active',access_type='free',minimum_plan='free',is_featured=true,is_public=true,keywords=excluded.keywords,updated_at=now();
insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit)
select id,'invoice',true,null from public.plans on conflict(plan_id,capability) do update set enabled=true,monthly_limit=null;

create table public.invoices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 invoice_number text not null check(char_length(trim(invoice_number)) between 1 and 50),
 invoice_date date not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=3000000),
 subtotal bigint not null check(subtotal>=0),
 discount bigint not null check(discount>=0),
 tax bigint not null check(tax>=0),
 total bigint not null check(total>=0),
 created_at timestamptz not null default now(),
 unique(workspace_id,invoice_number)
);
create index invoices_workspace_time on public.invoices(workspace_id,created_at desc);
alter table public.invoices enable row level security;
create policy invoices_read on public.invoices for select to authenticated using(
 user_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and (w.owner_id=(select auth.uid()) or exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id=(select auth.uid()))))
);
revoke all on public.invoices from public,anon,authenticated;
grant select on public.invoices to authenticated;

-- Invoice amounts are recomputed server-side from the submitted line items.
-- The authenticated identity and workspace membership are never caller supplied.
create function public.save_invoice(p_workspace uuid,p_invoice_number text,p_invoice_date date,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); access jsonb; row_item jsonb; qty numeric; price numeric;
 sub numeric:=0; disc numeric:=0; tax_amount numeric:=0; grand numeric:=0;
 tax_rate numeric:=0; discount_rate numeric:=0; saved public.invoices;
begin
 if u is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 access:=public.platform_access(p_workspace,'invoice');
 if not coalesce((access->>'enabled')::boolean,false) then raise exception 'ACCESS_BLOCKED' using errcode='42501'; end if;
 if access->>'monthly_limit' is not null and (access->>'used')::bigint >= (access->>'monthly_limit')::bigint then raise exception 'USAGE_LIMIT'; end if;
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT'; end if;
 if p_invoice_number is null or char_length(trim(p_invoice_number)) not between 1 and 50 or p_invoice_date is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>3000000 then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(jsonb_typeof(p_payload->'sender'),'')<>'object' or coalesce(jsonb_typeof(p_payload->'client'),'')<>'object' or coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' then raise exception 'INVALID_INVOICE'; end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(p_payload->'sender'->>'name','')='' or char_length(p_payload->'sender'->>'name')>120 or char_length(coalesce(p_payload->'sender'->>'address',''))>500 or char_length(coalesce(p_payload->'sender'->>'email',''))>254 or char_length(coalesce(p_payload->'client'->>'name',''))>120 or char_length(coalesce(p_payload->'client'->>'address',''))>500 or char_length(coalesce(p_payload->'client'->>'email',''))>254 or char_length(coalesce(p_payload->>'notes',''))>1000 then raise exception 'INVALID_INVOICE'; end if;
 if p_payload->>'logo_data_url' is not null and (char_length(p_payload->>'logo_data_url')>2800000 or p_payload->>'logo_data_url' !~ '^data:image/(png|jpeg|webp|svg\+xml|gif);base64,') then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(p_payload->>'tax_rate','0') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' or coalesce(p_payload->>'discount_rate','0') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'INVALID_INVOICE'; end if;
 tax_rate:=coalesce((p_payload->>'tax_rate')::numeric,0); discount_rate:=coalesce((p_payload->>'discount_rate')::numeric,0);
 if tax_rate>100 or discount_rate>100 then raise exception 'INVALID_INVOICE'; end if;
 for row_item in select value from jsonb_array_elements(p_payload->'items') loop
  if jsonb_typeof(row_item)<>'object' or coalesce(row_item->>'description','')='' or char_length(row_item->>'description')>160 then raise exception 'INVALID_INVOICE'; end if;
  if coalesce(row_item->>'quantity','') !~ '^[0-9]{1,6}$' or coalesce(row_item->>'unit_price','') !~ '^[0-9]{1,12}$' then raise exception 'INVALID_INVOICE'; end if;
  qty:=(row_item->>'quantity')::numeric; price:=(row_item->>'unit_price')::numeric;
  if qty<1 or price<0 then raise exception 'INVALID_INVOICE'; end if;
  sub:=sub+qty*price;
 end loop;
 if sub>9000000000000000 then raise exception 'INVALID_INVOICE'; end if;
 disc:=round(sub*discount_rate/100); tax_amount:=round((sub-disc)*tax_rate/100); grand:=sub-disc+tax_amount;
 insert into public.invoices(user_id,workspace_id,invoice_number,invoice_date,payload,subtotal,discount,tax,total)
 values(u,p_workspace,trim(p_invoice_number),p_invoice_date,p_payload,round(sub)::bigint,round(disc)::bigint,round(tax_amount)::bigint,round(grand)::bigint) returning * into saved;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(u,p_workspace,'invoice','invoice_saved');
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,'invoice','tool_value_completed');
 return jsonb_build_object('id',saved.id,'invoice_number',saved.invoice_number,'invoice_date',saved.invoice_date,'subtotal',saved.subtotal,'discount',saved.discount,'tax',saved.tax,'total',saved.total,'created_at',saved.created_at);
end;$$;
revoke all on function public.save_invoice(uuid,text,date,jsonb) from public,anon;
grant execute on function public.save_invoice(uuid,text,date,jsonb) to authenticated;
commit;

begin;
-- Staff is provisioned only by a trusted database operator, never profile metadata.
create table public.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public,anon,authenticated;
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.platform_admins where user_id=auth.uid());
$$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated;
create table public.admin_audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),action text not null,details jsonb not null,created_at timestamptz not null default now());
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public,anon,authenticated;

alter table public.request_groups add column description text not null default '' check(char_length(description)<=1000),add column status text not null default 'reviewing' check(status in('reviewing','planned','building','beta','released','declined')),add column is_public boolean not null default false,add column app_id text references public.apps(slug);
create table public.tool_request_votes(group_id uuid references public.request_groups(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,created_at timestamptz not null default now(),primary key(group_id,user_id));
alter table public.tool_request_votes enable row level security;
revoke all on public.tool_request_votes from public,anon,authenticated;
create index request_votes_workspace on public.tool_request_votes(workspace_id);
create table public.workspace_invitations(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,email text not null check(char_length(email) between 3 and 254),role text not null check(role in('viewer','editor')),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,revoked_at timestamptz);
create index invitations_email on public.workspace_invitations(lower(email));
create index invitations_workspace on public.workspace_invitations(workspace_id);
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public,anon,authenticated;

create function public.workspace_role(p_workspace uuid) returns text language sql stable security definer set search_path='' as $$
 select case when w.owner_id=auth.uid() then 'owner' else (select m.role from public.workspace_members m where m.workspace_id=w.id and m.user_id=auth.uid()) end from public.workspaces w where w.id=p_workspace;
$$;
revoke all on function public.workspace_role(uuid) from public,anon,authenticated;

-- Tool documents belong to the business; readers can inspect, editors can save.
drop policy invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using(workspace_id in(select id from public.workspaces));
drop policy qr_designs_read on public.qr_designs;
create policy qr_designs_read on public.qr_designs for select to authenticated using(workspace_id in(select id from public.workspaces));
create function public.guard_tool_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(public.workspace_role(new.workspace_id),'') not in('owner','editor') or new.user_id<>auth.uid() then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function public.guard_tool_write() from public,anon,authenticated;
create trigger invoice_editor before insert on public.invoices for each row execute function public.guard_tool_write();
create trigger qr_editor before insert on public.qr_designs for each row execute function public.guard_tool_write();

alter table public.platform_events drop constraint platform_events_name_check;
alter table public.platform_events add constraint platform_events_name_check check(name in('hub_viewed','tool_opened','second_tool_opened','tool_favorited','tool_value_completed','tool_request_submitted','upgrade_viewed','upgrade_clicked','tool_searched','member_invited','member_joined','member_removed','member_role_changed','invitation_revoked','request_voted'));

create function public.foundation_snapshot(p_workspace uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); r text; mail text; verified boolean; result jsonb;
begin
 if u is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 select lower(email),email_confirmed_at is not null into mail,verified from auth.users where id=u;
 if p_workspace is not null then
  r:=public.workspace_role(p_workspace);
  if r is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 end if;
 result:=jsonb_build_object('is_admin',public.is_platform_admin(),'role',r,
  'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'business',w.name,'role',i.role,'expires_at',i.expires_at)) from public.workspace_invitations i join public.workspaces w on w.id=i.workspace_id where lower(i.email)=mail and verified and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb),
  'members',case when p_workspace is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('user_id',x.user_id,'email',x.email,'role',x.role)) from (
   select w.owner_id as user_id,a.email,'owner'::text as role from public.workspaces w join auth.users a on a.id=w.owner_id where w.id=p_workspace
   union all select m.user_id,a.email,m.role from public.workspace_members m join auth.users a on a.id=m.user_id where m.workspace_id=p_workspace
  )x),'[]'::jsonb) end,
  'sent',case when r='owner' then coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'role',role,'expires_at',expires_at)) from public.workspace_invitations where workspace_id=p_workspace and accepted_at is null and revoked_at is null and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end,
  'ideas',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'description',g.description,'status',g.status,'app_id',g.app_id,'votes',(select count(*) from public.tool_request_votes v where v.group_id=g.id),'voted',exists(select 1 from public.tool_request_votes v where v.group_id=g.id and v.user_id=u)) order by g.created_at desc) from public.request_groups g where g.is_public),'[]'::jsonb));
 return result;
end;$$;
revoke all on function public.foundation_snapshot(uuid) from public,anon;
grant execute on function public.foundation_snapshot(uuid) to authenticated;

create function public.foundation_action(p_action text,p_workspace uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r text;mail text;verified boolean;i public.workspace_invitations;target uuid;event_name text;
begin
 if u is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT';end if;
 if p_action='accept' then
  select lower(email),email_confirmed_at is not null into mail,verified from auth.users where id=u;
  select * into i from public.workspace_invitations where id=(p_payload->>'id')::uuid for update;
  if not found or not coalesce(verified,false) or (mail is null or lower(i.email)<>mail) or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then raise exception 'INVITATION_UNAVAILABLE' using errcode='42501';end if;
  if exists(select 1 from public.workspaces where id=i.workspace_id and owner_id=u) then raise exception 'ALREADY_MEMBER';end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(i.workspace_id,u,i.role) on conflict do nothing;
  update public.workspace_invitations set accepted_at=now() where id=i.id;
  p_workspace:=i.workspace_id;event_name:='member_joined';
 else
  r:=public.workspace_role(p_workspace);
  if r is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
  if p_action='vote' then
   target:=(p_payload->>'id')::uuid;
   if not exists(select 1 from public.request_groups where id=target and is_public and status not in('released','declined')) then raise exception 'IDEA_UNAVAILABLE';end if;
   if coalesce((p_payload->>'voted')::boolean,false) then
    insert into public.tool_request_votes(group_id,user_id,workspace_id) values(target,u,p_workspace) on conflict do nothing;
   else delete from public.tool_request_votes where group_id=target and user_id=u;end if;
   event_name:='request_voted';
  else
   if r<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;
   if p_action='invite' then
    mail:=lower(trim(p_payload->>'email'));
    if mail is null or char_length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or coalesce(p_payload->>'role','') not in('viewer','editor') then raise exception 'INVALID_INPUT';end if;
    if (select count(*) from public.workspace_invitations where created_by=u and created_at>now()-interval '1 hour')>=30 then raise exception 'RATE_LIMIT';end if;
    if exists(select 1 from auth.users a where lower(a.email)=mail and (a.id=u or exists(select 1 from public.workspace_members m where m.user_id=a.id and m.workspace_id=p_workspace))) then raise exception 'ALREADY_MEMBER';end if;
    update public.workspace_invitations set revoked_at=now() where workspace_id=p_workspace and email=mail and accepted_at is null and revoked_at is null;
    insert into public.workspace_invitations(workspace_id,email,role,created_by) values(p_workspace,mail,p_payload->>'role',u);
    event_name:='member_invited';
   elsif p_action='revoke' then
    update public.workspace_invitations set revoked_at=now() where id=(p_payload->>'id')::uuid and workspace_id=p_workspace and accepted_at is null;
    if not found then raise exception 'NOT_FOUND';end if;event_name:='invitation_revoked';
   elsif p_action in('remove','role') then
    target:=(p_payload->>'user_id')::uuid;
    if target=u then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;
    if p_action='remove' then delete from public.workspace_members where workspace_id=p_workspace and user_id=target;event_name:='member_removed';
    else
     if coalesce(p_payload->>'role','') not in('viewer','editor') then raise exception 'INVALID_INPUT';end if;
     update public.workspace_members set role=p_payload->>'role' where workspace_id=p_workspace and user_id=target;event_name:='member_role_changed';
    end if;
    if not found then raise exception 'NOT_FOUND';end if;
   else raise exception 'INVALID_ACTION';end if;
  end if;
 end if;
 insert into public.platform_events(user_id,workspace_id,name) values(u,p_workspace,event_name);
 return jsonb_build_object('ok',true,'workspace_id',p_workspace);
end;$$;
revoke all on function public.foundation_action(text,uuid,jsonb) from public,anon;
grant execute on function public.foundation_action(text,uuid,jsonb) to authenticated;

create function public.admin_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 return jsonb_build_object(
 'apps',coalesce((select jsonb_agg(a order by a.created_at) from public.apps a),'[]'::jsonb),
 'entitlements',coalesce((select jsonb_agg(e order by e.plan_id,e.capability) from public.plan_entitlements e),'[]'::jsonb),
 'billing',coalesce((select jsonb_agg(p order by p.plan_id) from public.billing_plans p),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(r) from(select id,problem,workflow,frequency,status,group_id,created_at from public.tool_requests order by created_at desc limit 100)r),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'description',g.description,'status',g.status,'is_public',g.is_public,'app_id',g.app_id,'requests',(select count(*) from public.tool_requests r where r.group_id=g.id),'votes',(select count(*) from public.tool_request_votes v where v.group_id=g.id))) from public.request_groups g),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(a) from(select action,details,created_at from public.admin_audit_events order by created_at desc limit 30)a),'[]'::jsonb));
end;$$;
revoke all on function public.admin_snapshot() from public,anon;
grant execute on function public.admin_snapshot() to authenticated;

create function public.admin_action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();slug text;dest text;target uuid;
begin
 if not public.is_platform_admin() then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from public.admin_audit_events where actor_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT';end if;
 if p_payload is null or octet_length(p_payload::text)>10000 then raise exception 'INVALID_INPUT';end if;
 if p_action='app' then
  slug:=p_payload->>'slug';
  if coalesce(slug,'') !~ '^[a-z][a-z0-9-]{1,59}$' or coalesce(char_length(trim(p_payload->>'name')),0) not between 1 and 80 or coalesce(char_length(trim(p_payload->>'description')),0) not between 1 and 300 or coalesce(p_payload->>'status','') not in('active','beta','coming_soon','deprecated','private') or coalesce(p_payload->>'category','') not in('Bisnis','Utilitas','AI') then raise exception 'INVALID_INPUT';end if;
  dest:=case slug when 'invoice' then '/tools/invoice' when 'qr' then '/tools/qr' when 'business-report' then '/tools/business-report' when 'invoice-quotation' then '/tools/invoice-quotation' else null end;
  if dest is null and p_payload->>'status' in('active','beta') then raise exception 'TOOL_NOT_INTEGRATED';end if;
  insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,is_featured,is_public,keywords)
  values(slug,trim(p_payload->>'name'),trim(p_payload->>'description'),p_payload->>'category',case slug when 'invoice' then 'invoice' when 'qr' then 'qr' when 'business-report' then 'report' when 'invoice-quotation' then 'invoice' else 'assistant' end,dest,p_payload->>'status','included',false,coalesce((p_payload->>'is_public')::boolean,false),coalesce(p_payload->>'keywords',''))
  on conflict(slug) do update set name=excluded.name,description=excluded.description,category=excluded.category,status=excluded.status,is_public=excluded.is_public,keywords=excluded.keywords,updated_at=now();
 elsif p_action='group' then
  if coalesce(char_length(trim(p_payload->>'title')),0) not between 3 and 120 or char_length(coalesce(p_payload->>'description',''))>1000 or coalesce(p_payload->>'status','') not in('reviewing','planned','building','beta','released','declined') then raise exception 'INVALID_INPUT';end if;
  if p_payload->>'status'='released' and not exists(select 1 from public.apps where slug=p_payload->>'app_id' and status in('active','beta') and is_public) then raise exception 'TOOL_NOT_INTEGRATED';end if;
  target:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  insert into public.request_groups(id,title,description,status,is_public,app_id) values(target,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'status',coalesce((p_payload->>'is_public')::boolean,false),nullif(p_payload->>'app_id',''))
  on conflict(id) do update set title=excluded.title,description=excluded.description,status=excluded.status,is_public=excluded.is_public,app_id=excluded.app_id;
 elsif p_action='request' then
  if coalesce(p_payload->>'status','') not in('submitted','reviewing','planned','building','beta','released','declined') then raise exception 'INVALID_INPUT';end if;
  target:=nullif(p_payload->>'group_id','')::uuid;
  if p_payload->>'status'='released' and not exists(select 1 from public.request_groups g join public.apps a on a.slug=g.app_id where g.id=target and g.status='released' and a.status in('active','beta') and a.is_public) then raise exception 'TOOL_NOT_INTEGRATED';end if;
  update public.tool_requests set status=p_payload->>'status',group_id=target where id=(p_payload->>'id')::uuid;
  if not found then raise exception 'NOT_FOUND';end if;
 elsif p_action='entitlement' then
  if (not exists(select 1 from public.apps app where app.slug=p_payload->>'capability') and coalesce(p_payload->>'capability','') not in('invoice_quotation.create_quotation','invoice_quotation.create_invoice','invoice_quotation.pdf_export','invoice_quotation.custom_branding','invoice_quotation.team_access','invoice_quotation.monthly_documents')) or coalesce(p_payload->>'plan_id','') not in('free','pro','business') or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
  insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit) values(p_payload->>'plan_id',p_payload->>'capability',(p_payload->>'enabled')::boolean,(p_payload->>'monthly_limit')::integer)
  on conflict(plan_id,capability) do update set enabled=excluded.enabled,monthly_limit=excluded.monthly_limit;
 elsif p_action='billing' then
  if coalesce(p_payload->>'plan_id','') not in('pro','business') or coalesce((p_payload->>'period_days')::integer,0) not between 1 and 366 or coalesce((p_payload->>'amount_idr')::bigint,0) not between 1 and 100000000 or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'INVALID_INPUT';end if;
  update public.billing_plans set amount_idr=(p_payload->>'amount_idr')::bigint,period_days=(p_payload->>'period_days')::integer,active=(p_payload->>'active')::boolean where plan_id=p_payload->>'plan_id';
 else raise exception 'INVALID_ACTION';end if;
 insert into public.admin_audit_events(actor_id,action,details) values(u,p_action,p_payload);
 return jsonb_build_object('ok',true,'id',target);
end;$$;
revoke all on function public.admin_action(text,jsonb) from public,anon;
grant execute on function public.admin_action(text,jsonb) to authenticated;
commit;

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

begin;
create function public.iq_pdf_document(w uuid,doc uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;begin
 perform public.iq_access(w,'invoice_quotation.pdf_export');
 perform pg_advisory_xact_lock(hashtext('iq-pdf:'||auth.uid()::text));
 if (select count(*) from public.iq_document_events where actor_id=auth.uid() and event='iq_pdf_requested' and created_at>now()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT';end if;
 d:=public.iq_read(w,doc=>doc);
 if d->>'lifecycle_status'='draft' then raise exception 'ISSUE_FIRST';end if;
 insert into public.iq_document_events(workspace_id,document_id,actor_id,event) values(w,doc,auth.uid(),'iq_pdf_requested');
 return d;
end;$$;
revoke all on function public.iq_pdf_document(uuid,uuid) from public,anon;
grant execute on function public.iq_pdf_document(uuid,uuid) to authenticated;
commit;
create function public.iq_pdf_record(w uuid,doc uuid) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;begin
 a:=public.iq_access(w,'invoice_quotation.pdf_export');
 perform pg_advisory_xact_lock(hashtext('iq-pdf:'||auth.uid()::text));
 if (select count(*) from public.usage_events where user_id=auth.uid() and app_id='invoice-quotation' and metric='pdf_generated' and created_at>=date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta') >= coalesce((a->>'feature_limit')::integer,2147483647) then raise exception 'USAGE_LIMIT';end if;
 if not exists(select 1 from public.iq_documents where workspace_id=w and id=doc and lifecycle_status<>'draft') then raise exception 'NOT_FOUND' using errcode='42501';end if;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(auth.uid(),w,'invoice-quotation','pdf_generated');
 insert into public.iq_document_events(workspace_id,document_id,actor_id,event) values(w,doc,auth.uid(),'iq_pdf_generated');
end;$$;
revoke all on function public.iq_pdf_record(uuid,uuid) from public,anon;
grant execute on function public.iq_pdf_record(uuid,uuid) to authenticated;
begin;
alter table public.platform_events drop constraint platform_events_name_check;
alter table public.platform_events add constraint platform_events_name_check check(name in('hub_viewed','tool_opened','second_tool_opened','tool_favorited','tool_value_completed','tool_request_submitted','upgrade_viewed','upgrade_clicked','tool_searched','member_invited','member_joined','member_removed','member_role_changed','invitation_revoked','request_voted','kasir_product_saved','kasir_receipt_share','kasir_receipt_revoke'));
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords)
values('kasir-pinter','Kasir Pinter','Catat penjualan, hitung kembalian, dan bagikan struk lewat QR.','Bisnis','kasir','/tools/kasir-pinter','beta','included','free',true,true,'kasir pos warung toko fnb penjualan struk receipt qr pembayaran') on conflict(slug) do nothing;
insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit) select id,'kasir-pinter',true,null from public.plans on conflict do nothing;
create table public.kasir_products(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),name text not null check(length(trim(name)) between 1 and 100),category text not null default '' check(length(category)<=60),price bigint not null check(price between 0 and 1000000000),active boolean not null default true,unique(workspace_id,id));
create table public.kasir_sales(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references auth.users(id),idempotency_key uuid not null,receipt jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,idempotency_key),unique(workspace_id,id));
create index kasir_sales_time on public.kasir_sales(workspace_id,created_at desc);
create index kasir_products_workspace on public.kasir_products(workspace_id,name);
create table public.kasir_sequences(workspace_id uuid primary key references public.workspaces(id),n bigint not null);
create table public.kasir_shares(sale_id uuid primary key,workspace_id uuid not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,foreign key(workspace_id,sale_id) references public.kasir_sales(workspace_id,id));
alter table public.kasir_shares enable row level security;
alter table public.kasir_sequences enable row level security;
alter table public.kasir_sales enable row level security;
alter table public.kasir_products enable row level security;
revoke all on public.kasir_products,public.kasir_sales,public.kasir_sequences,public.kasir_shares from public,anon,authenticated;
-- No Data API table access: authorized, bounded RPCs are the only boundary.
create function public.kasir_access(w uuid,writing boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;begin
 if auth.uid() is null or public.workspace_role(w) is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 a:=public.platform_access(w,'kasir-pinter');
 if not coalesce((a->>'enabled')::boolean,false) then raise exception 'ACCESS_BLOCKED' using errcode='42501';end if;
 if writing and public.workspace_role(w) not in('owner','editor') then raise exception 'READ_ONLY' using errcode='42501';end if;
 return a;end;$$;
revoke all on function public.kasir_access(uuid,boolean) from public,anon,authenticated;
create function public.kasir_read(w uuid,section text default 'products',q text default '',page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone text;begin
 perform public.kasir_access(w);
 if section not in('products','sales','summary') or page is null or page not between 0 and 100000 or q is null or length(q)>120 then raise exception 'INVALID_INPUT';end if;
 if section='products' then return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from(select * from public.kasir_products where workspace_id=w and (name ilike '%'||q||'%' or category ilike '%'||q||'%') order by name,id limit 25 offset page*25)x),'[]'::jsonb));end if;
 if section='sales' then return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from(select id,receipt,created_at from public.kasir_sales where workspace_id=w and receipt->>'number' ilike '%'||q||'%' order by created_at desc,id limit 25 offset page*25)x),'[]'::jsonb));end if;
 select timezone into zone from public.workspaces where id=w;
 return jsonb_build_object('count',(select count(*) from public.kasir_sales where workspace_id=w and (created_at at time zone zone)::date=(now() at time zone zone)::date),'total',(select coalesce(sum((receipt->>'total')::bigint),0) from public.kasir_sales where workspace_id=w and (created_at at time zone zone)::date=(now() at time zone zone)::date),'top',coalesce((select jsonb_agg(x) from(select item->>'name' as name,sum((item->>'quantity')::bigint) as quantity from public.kasir_sales s cross join lateral jsonb_array_elements(s.receipt->'items') item where s.workspace_id=w and (s.created_at at time zone zone)::date=(now() at time zone zone)::date group by item->>'name' order by quantity desc,name limit 5)x),'[]'::jsonb));
end;$$;
revoke all on function public.kasir_read(uuid,text,text,integer) from public,anon;
grant execute on function public.kasir_read(uuid,text,text,integer) to authenticated;
create function public.kasir_action(w uuid,action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;u uuid:=auth.uid();prod public.kasir_products;prior public.kasir_sales;item jsonb;lines jsonb:='[]';q bigint;sub bigint:=0;disc bigint;total bigint;tender bigint;number bigint;business text;currency text;id uuid;receipt jsonb;method text;begin
 a:=public.kasir_access(w,true);
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>16000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 perform pg_advisory_xact_lock(hashtext(w::text));
 if action='checkout' then
 select * into prior from public.kasir_sales where workspace_id=w and idempotency_key=(p->>'key')::uuid;
 if found then return jsonb_build_object('id',prior.id,'receipt',prior.receipt,'created_at',prior.created_at);end if;
 end if;
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT';end if;
 if action='product' then
 if coalesce(length(trim(p->>'name')),0) not between 1 and 100 or length(coalesce(p->>'category',''))>60 or coalesce(p->>'price','') !~ '^[0-9]{1,10}$' or (p->>'price')::bigint>1000000000 then raise exception 'INVALID_INPUT';end if;
 if p->>'id' is not null then
 update public.kasir_products set name=trim(p->>'name'),category=coalesce(p->>'category',''),price=(p->>'price')::bigint,active=coalesce((p->>'active')::boolean,true) where workspace_id=w and kasir_products.id=(p->>'id')::uuid returning * into prod;
 if not found then raise exception 'NOT_FOUND';end if;
 else insert into public.kasir_products(workspace_id,name,category,price) values(w,trim(p->>'name'),coalesce(p->>'category',''),(p->>'price')::bigint) returning * into prod;end if;
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','kasir_product_saved');return to_jsonb(prod);
 elsif action='checkout' then
 -- Re-read access under the account quota lock.
 a:=public.kasir_access(w,true);
 if a->>'monthly_limit' is not null and (a->>'used')::bigint >= (a->>'monthly_limit')::bigint then raise exception 'USAGE_LIMIT';end if;
 select name,workspaces.currency into business,currency from public.workspaces where workspaces.id=w;
 if currency<>'IDR' then raise exception 'IDR_REQUIRED';end if;
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 or coalesce(p->>'key','')='' then raise exception 'INVALID_INPUT';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p->'items'))<>jsonb_array_length(p->'items') then raise exception 'INVALID_INPUT';end if;
 for item in select value from jsonb_array_elements(p->'items') loop
 if coalesce(item->>'quantity','') !~ '^[0-9]{1,4}$' or (item->>'quantity')::bigint<1 then raise exception 'INVALID_INPUT';end if;
 q:=(item->>'quantity')::bigint;
 select * into prod from public.kasir_products where workspace_id=w and kasir_products.id=(item->>'id')::uuid and active;
 if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if (item->>'price')::bigint is distinct from prod.price then raise exception 'PRICE_CHANGED';end if;
 sub:=sub+q*prod.price;lines:=lines||jsonb_build_array(jsonb_build_object('name',prod.name,'quantity',q,'price',prod.price,'total',q*prod.price));end loop;
 if coalesce(p->>'discount','') !~ '^[0-9]{1,10}$' or coalesce(p->>'tendered','') !~ '^[0-9]{1,13}$' then raise exception 'INVALID_INPUT';end if;
 disc:=(p->>'discount')::bigint;total:=sub-disc;tender:=(p->>'tendered')::bigint;method:=p->>'method';
 if sub>1000000000000 or disc>1000000000 or disc>sub or tender>1000000000000 or tender<total or method is null or method not in('cash','transfer','qris') or (method<>'cash' and tender<>total) then raise exception 'INVALID_PAYMENT';end if;
 insert into public.kasir_sequences(workspace_id,n) values(w,1) on conflict(workspace_id) do update set n=kasir_sequences.n+1 returning n into number;
 receipt:=jsonb_build_object('number','KP-'||lpad(number::text,greatest(8,length(number::text)),'0'),'business',business,'date',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'items',lines,'subtotal',sub,'discount',disc,'total',total,'method',method,'tendered',tender,'change',tender-total);
 insert into public.kasir_sales(workspace_id,created_by,idempotency_key,receipt) values(w,u,(p->>'key')::uuid,receipt) returning kasir_sales.id into id;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(u,w,'kasir-pinter','sale_completed');
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','tool_value_completed');return jsonb_build_object('id',id,'receipt',receipt,'created_at',now());
 elsif action in('share','revoke') then
 if not exists(select 1 from public.kasir_sales where workspace_id=w and kasir_sales.id=(p->>'id')::uuid) then raise exception 'NOT_FOUND';end if;
 if action='revoke' then delete from public.kasir_shares where workspace_id=w and sale_id=(p->>'id')::uuid;
 else
 if coalesce(p->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 insert into public.kasir_shares(sale_id,workspace_id,token_hash,expires_at) values((p->>'id')::uuid,w,p->>'hash',now()+interval '30 days') on conflict(sale_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
 end if;
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','kasir_receipt_'||action);return jsonb_build_object('ok',true);
 else raise exception 'INVALID_ACTION';end if;
end;$$;
revoke all on function public.kasir_action(uuid,text,jsonb) from public,anon;
grant execute on function public.kasir_action(uuid,text,jsonb) to authenticated;
-- Only the server can look up a bearer receipt token. No public table or list access.
create function public.kasir_receipt(token_hash text) returns jsonb language sql stable security definer set search_path='' as $$select s.receipt from public.kasir_shares t join public.kasir_sales s on s.id=t.sale_id and s.workspace_id=t.workspace_id where t.token_hash=$1 and t.expires_at>now() and $1 ~ '^[a-f0-9]{64}$'$$;
revoke all on function public.kasir_receipt(text) from public,anon,authenticated;
grant execute on function public.kasir_receipt(text) to service_role;
commit;
begin;
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_public,keywords) values('connect','PRCUISA Connect','Laporan dan notifikasi bisnis dalam satu tempat.','Bisnis','report','/connect','beta','included','free',true,'notifikasi laporan telegram whatsapp connect') on conflict do nothing;
insert into public.plan_entitlements(plan_id,capability,enabled) select id,'connect',true from public.plans on conflict do nothing;
create table public.connect_channels(id text primary key check(id in('inapp','telegram','whatsapp','email','push','webhook')),name text not null,status text not null check(status in('active','setup_required','planned')));
insert into public.connect_channels values('inapp','Dalam aplikasi','active'),('telegram','Telegram','setup_required'),('whatsapp','WhatsApp','setup_required'),('email','Email','setup_required'),('push','Web Push','planned'),('webhook','Webhook','planned');
create table public.connect_preferences(user_id uuid references auth.users(id) on delete cascade,workspace_id uuid references public.workspaces(id) on delete cascade,enabled boolean not null default false,domains text[] not null default array['sales','finance','invoice','qr'],local_time time not null default '21:00',timezone text not null default 'Asia/Jakarta',next_run_at timestamptz,last_run_at timestamptz,updated_at timestamptz not null default now(),primary key(user_id,workspace_id),check(domains <@ array['sales','finance','invoice','qr']::text[]));
create table public.connect_event_outbox(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,event_type text not null,source_app text not null,source_entity_id uuid not null,idempotency_key text not null unique,schema_version int not null default 1 check(schema_version=1),payload jsonb not null default '{}',occurred_at timestamptz not null default now(),processed_at timestamptz);
create index connect_outbox_pending on public.connect_event_outbox(occurred_at) where processed_at is null;
create table public.connect_deliveries(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,logical_key text not null unique,channel text not null references public.connect_channels(id),status text not null default 'pending' check(status in('pending','processing','accepted','delivered','dead_letter','cancelled')),payload jsonb not null,attempt_count int not null default 0,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now());
create index connect_queue_due on public.connect_deliveries(next_attempt_at) where status='pending';
create table public.connect_notifications(id uuid primary key default gen_random_uuid(),delivery_id uuid not null unique references public.connect_deliveries(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,payload jsonb not null,read_at timestamptz,created_at timestamptz not null default now());
create index connect_inbox_user on public.connect_notifications(user_id,workspace_id,created_at desc);
create table public.connect_delivery_attempts(id uuid primary key default gen_random_uuid(),delivery_id uuid not null references public.connect_deliveries(id) on delete cascade,status text not null,created_at timestamptz not null default now());
create table public.connect_report_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,cutoff timestamptz not null,snapshot jsonb not null,unique(user_id,workspace_id,cutoff));
-- Narrow RPC mutations; browser cannot manufacture events, subscriptions or deliveries.
do $$declare t text;begin foreach t in array array['connect_channels','connect_preferences','connect_event_outbox','connect_deliveries','connect_notifications','connect_delivery_attempts','connect_report_runs'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end$$;
create policy connect_preferences_self on public.connect_preferences for select to authenticated using(user_id=auth.uid() and workspace_id in(select id from public.workspaces));
create policy connect_inbox_self on public.connect_notifications for select to authenticated using(user_id=auth.uid() and workspace_id in(select id from public.workspaces));
grant select on public.connect_preferences,public.connect_notifications to authenticated;
create function public.connect_allowed(u uuid,w uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.workspaces where id=w and owner_id=u) and exists(select 1 from public.plan_entitlements e where e.capability='connect' and e.enabled and e.plan_id=coalesce((select plan_id from public.subscriptions where user_id=u and status in('active','trialing') and (current_period_end is null or current_period_end>now()) limit 1),'free'))$$;
revoke all on function public.connect_allowed(uuid,uuid) from public,anon,authenticated;
-- Owner-only financial reports initially; broader roles require explicit financial permission.
create function public.connect_report(w uuid,cutoff timestamptz,zone text,domains text[],since_at timestamptz default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz; result jsonb;begin
 start_at:=coalesce(since_at,date_trunc('day',cutoff at time zone zone) at time zone zone);
 result:=jsonb_build_object('title','Ringkasan bisnis','period_start',start_at,'cutoff',cutoff,'timezone',zone,'business',(select name from public.workspaces where id=w));
 if 'sales'=any(domains) then result:=result||jsonb_build_object('sales',jsonb_build_object('count',(select count(*) from public.kasir_sales where workspace_id=w and created_at>=start_at and created_at<cutoff),'recorded',(select coalesce(sum((receipt->>'total')::numeric),0) from public.kasir_sales where workspace_id=w and created_at>=start_at and created_at<cutoff)));end if;
 if 'finance'=any(domains) then result:=result||jsonb_build_object('finance',jsonb_build_object('income',(select coalesce(sum(amount),0) from public.transactions where workspace_id=w and kind='revenue' and created_at>=start_at and created_at<cutoff),'expense',(select coalesce(sum(amount),0) from public.transactions where workspace_id=w and kind='expense' and created_at>=start_at and created_at<cutoff)));end if;
 if 'qr'=any(domains) then result:=result||jsonb_build_object('qr',jsonb_build_object('created',(select count(*) from public.qr_designs where workspace_id=w and created_at>=start_at and created_at<cutoff),'scans_available',false));end if;
 -- Issued value is not cash received. Outstanding uses only non-reversed recorded payments.
 if 'invoice'=any(domains) then result:=result||jsonb_build_object('invoice',jsonb_build_object('issued',(select count(*) from public.iq_documents where workspace_id=w and document_type='invoice' and lifecycle_status='issued' and issued_at>=start_at and issued_at<cutoff)));end if;
 return result;end;$$;
revoke all on function public.connect_report(uuid,timestamptz,text,text[],timestamptz) from public,anon,authenticated;
create function public.connect_action(w uuid,action text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();pref public.connect_preferences;tz text;tm time;n timestamptz;begin
 if u is null or not public.connect_allowed(u,w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 if octet_length(p::text)>4000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext(u::text||'connect'));
 if action='save' then
 tz:=coalesce(p->>'timezone','Asia/Jakarta');if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_TIMEZONE';end if;
 tm:=(p->>'local_time')::time;if tm is null then raise exception 'INVALID_TIME';end if;
 n:=((now() at time zone tz)::date+tm) at time zone tz;if n<=now() then n:=(((now() at time zone tz)::date+1)+tm) at time zone tz;end if;
 insert into public.connect_preferences(user_id,workspace_id,enabled,domains,local_time,timezone,next_run_at) values(u,w,coalesce((p->>'enabled')::boolean,false),array(select jsonb_array_elements_text(p->'domains')),tm,tz,n) on conflict(user_id,workspace_id) do update set enabled=excluded.enabled,domains=excluded.domains,local_time=excluded.local_time,timezone=excluded.timezone,next_run_at=excluded.next_run_at,updated_at=now();
 if not (p->>'enabled')::boolean then update public.connect_deliveries set status='cancelled' where user_id=u and workspace_id=w and status='pending';end if;
 elsif action='read' then update public.connect_notifications set read_at=now() where user_id=u and workspace_id=w and (p->>'id' is null or id=(p->>'id')::uuid);
 elsif action='test' then
 if exists(select 1 from public.connect_deliveries where user_id=u and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMIT';end if;
 insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload) values(u,w,'test:'||u::text||':'||gen_random_uuid()::text,'inapp',jsonb_build_object('title','Notifikasi uji','message','PRCUISA Connect siap menerima notifikasi dalam aplikasi.'));
 elsif action='preview' then select * into pref from public.connect_preferences where user_id=u and workspace_id=w;return public.connect_report(w,now(),coalesce(pref.timezone,'Asia/Jakarta'),coalesce(pref.domains,array['sales','finance','invoice','qr']));
 elsif action<>'read_state' then raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('channels',(select jsonb_agg(c) from public.connect_channels c),'preference',(select to_jsonb(s) from public.connect_preferences s where user_id=u and workspace_id=w),'notifications',coalesce((select jsonb_agg(x) from(select id,payload,read_at,created_at from public.connect_notifications where user_id=u and workspace_id=w order by created_at desc limit 25)x),'[]'::jsonb),'deliveries',coalesce((select jsonb_agg(x) from(select id,channel,status,attempt_count,created_at from public.connect_deliveries where user_id=u and workspace_id=w order by created_at desc limit 25)x),'[]'::jsonb));
end;$$;
revoke all on function public.connect_action(uuid,text,jsonb) from public,anon;
grant execute on function public.connect_action(uuid,text,jsonb) to authenticated;
-- Transactional, ID-only outbox from real successful source writes. No browser event API.
create function public.connect_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare typ text;app text;begin
 if tg_table_name='kasir_sales' then typ:='pos.sale.completed.v1';app:='kasir-pinter';
 elsif tg_table_name='transactions' then typ:=case new.kind when 'revenue' then 'finance.income.recorded.v1' else 'finance.expense.recorded.v1' end;app:='business-report';
 elsif tg_table_name='qr_designs' then typ:='qr.created.v1';app:='qr';
 elsif tg_table_name='iq_document_events' then
 typ:=case new.event when 'iq_invoice_issued' then 'invoice.issued.v1' when 'iq_payment_recorded' then 'invoice.payment.recorded.v1' when 'iq_payment_reversed' then 'invoice.payment.reversed.v1' when 'iq_accept_recorded' then 'quotation.accepted.v1' end;
 if typ is null then return new;end if;app:='invoice-quotation';
 else return new;end if;
 insert into public.connect_event_outbox(workspace_id,event_type,source_app,source_entity_id,idempotency_key,payload) values(new.workspace_id,typ,app,new.id,typ||':'||new.id::text,jsonb_build_object('entity_id',new.id)) on conflict do nothing;return new;end;$$;
revoke all on function public.connect_capture() from public,anon,authenticated;
create trigger connect_sale after insert on public.kasir_sales for each row execute function public.connect_capture();
create trigger connect_finance after insert on public.transactions for each row execute function public.connect_capture();
create trigger connect_qr after insert on public.qr_designs for each row execute function public.connect_capture();
create trigger connect_invoice after insert on public.iq_document_events for each row execute function public.connect_capture();
-- One transaction claims schedules, creates immutable snapshots, and delivers in-app.
-- No external calls inside database transactions. External adapters are not enabled yet.
create function public.connect_tick() returns integer language plpgsql security definer set search_path='' as $$
declare s public.connect_preferences;d public.connect_deliveries;r uuid;snap jsonb;n integer:=0;lim bigint;used bigint;plan text;begin
 for s in select * from public.connect_preferences where enabled and next_run_at<=now() order by next_run_at for update skip locked limit 50 loop
 if public.connect_allowed(s.user_id,s.workspace_id) then
 snap:=public.connect_report(s.workspace_id,s.next_run_at,s.timezone,s.domains);
 if s.last_run_at is not null and s.last_run_at < date_trunc('day',s.next_run_at at time zone s.timezone) at time zone s.timezone then
 snap:=snap||jsonb_build_object('previous_tail',public.connect_report(s.workspace_id,date_trunc('day',s.next_run_at at time zone s.timezone) at time zone s.timezone,s.timezone,s.domains,s.last_run_at)||jsonb_build_object('title','Aktivitas setelah laporan sebelumnya'));
 end if;
 insert into public.connect_report_runs(user_id,workspace_id,cutoff,snapshot) values(s.user_id,s.workspace_id,s.next_run_at,snap) on conflict do nothing returning id into r;
 if r is not null then insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload) values(s.user_id,s.workspace_id,r::text||':inapp','inapp',snap) on conflict do nothing;end if;
 end if;
 update public.connect_preferences set last_run_at=next_run_at,next_run_at=(((next_run_at at time zone s.timezone)::date+1)+s.local_time) at time zone s.timezone where user_id=s.user_id and workspace_id=s.workspace_id;
 end loop;
 for d in select * from public.connect_deliveries where status='pending' and channel='inapp' and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 100 loop
 if not public.connect_allowed(d.user_id,d.workspace_id) then update public.connect_deliveries set status='cancelled' where id=d.id;continue;end if;
 perform pg_advisory_xact_lock(hashtext(d.user_id::text||'connect'));
 select coalesce((select plan_id from public.subscriptions where user_id=d.user_id and status in('active','trialing') and (current_period_end is null or current_period_end>now()) limit 1),'free') into plan;
 select monthly_limit into lim from public.plan_entitlements where plan_id=plan and capability='connect';
 select coalesce(sum(quantity),0) into used from public.usage_events where user_id=d.user_id and app_id='connect' and created_at>=date_trunc('month',now());
 if lim is not null and used>=lim then update public.connect_deliveries set status='cancelled' where id=d.id;continue;end if;
 insert into public.connect_notifications(delivery_id,user_id,workspace_id,payload) values(d.id,d.user_id,d.workspace_id,d.payload) on conflict do nothing;
 insert into public.connect_delivery_attempts(delivery_id,status) values(d.id,'delivered');
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(d.user_id,d.workspace_id,'connect','connect.delivery.accepted');
 update public.connect_deliveries set status='delivered',attempt_count=attempt_count+1 where id=d.id;n:=n+1;
 end loop;return n;end;$$;
revoke all on function public.connect_tick() from public,anon,authenticated;
grant execute on function public.connect_tick() to service_role;
commit;
begin;
update public.apps set icon='plug' where slug='connect';
create table public.connect_connections(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,channel text not null check(channel in('telegram','whatsapp','email','push','webhook')),destination_encrypted text,destination_hash text,challenge_hash text,expires_at timestamptz,attempts int not null default 0,status text not null check(status in('pending','verified','revoked')),consented_at timestamptz not null default now(),verified_at timestamptz,updated_at timestamptz not null default now());
create unique index connect_one_active on public.connect_connections(user_id,workspace_id,channel) where status<>'revoked' and channel<>'push';
create unique index connect_push_device on public.connect_connections(user_id,workspace_id,destination_hash) where status<>'revoked' and channel='push';
create index connect_challenge_hash on public.connect_connections(challenge_hash) where status='pending';
alter table public.connect_connections enable row level security;
revoke all on public.connect_connections from public,anon,authenticated;
alter table public.connect_deliveries add column connection_id uuid references public.connect_connections(id);
alter table public.connect_deliveries add column lease_id uuid;
alter table public.connect_deliveries add column lease_until timestamptz;
alter table public.connect_deliveries add column provider_message_id text;
alter table public.connect_deliveries add column last_error_code text;
create function public.connect_connections_read(w uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null or not public.connect_allowed(auth.uid(),w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('id',id,'channel',channel,'status',status,'verified_at',verified_at)) from public.connect_connections where user_id=auth.uid() and workspace_id=w),'[]');end;$$;
revoke all on function public.connect_connections_read(uuid) from public,anon;
grant execute on function public.connect_connections_read(uuid) to authenticated;
create function public.connect_disconnect(w uuid,c uuid) returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null or not public.connect_allowed(auth.uid(),w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
update public.connect_connections set status='revoked',destination_encrypted=null,challenge_hash=null,updated_at=now() where id=c and workspace_id=w and user_id=auth.uid();
update public.connect_deliveries set status='cancelled' where connection_id=c and workspace_id=w and user_id=auth.uid() and status in('pending','processing');end;$$;
revoke all on function public.connect_disconnect(uuid,uuid) from public,anon;
grant execute on function public.connect_disconnect(uuid,uuid) to authenticated;
create function public.connect_start(u uuid,w uuid,c text,ident uuid,hash text,dest text,lookup_hash text) returns uuid language plpgsql security definer set search_path='' as $$declare current_row public.connect_connections;begin
if not public.connect_allowed(u,w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
if c not in('telegram','whatsapp','email','push','webhook') or hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
perform pg_advisory_xact_lock(hashtext(u::text||'connect'));
select * into current_row from public.connect_connections where user_id=u and workspace_id=w and channel=c and status<>'revoked' and (c<>'push' or destination_hash=lookup_hash);
if found and current_row.updated_at>now()-interval '1 minute' then raise exception 'RATE_LIMIT';end if;
if (select count(*) from public.connect_connections where user_id=u and consented_at>now()-interval '1 hour')>=10 then raise exception 'RATE_LIMIT';end if;
-- New challenge rotates row identity only when no referenced deliveries exist; retain stable id instead.
if current_row.id is not null then raise exception 'DISCONNECT_FIRST';end if;
insert into public.connect_connections(id,user_id,workspace_id,channel,destination_encrypted,destination_hash,challenge_hash,expires_at,status) values(ident,u,w,c,dest,lookup_hash,hash,now()+interval '10 minutes','pending');return ident;end;$$;
revoke all on function public.connect_start(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.connect_start(uuid,uuid,text,uuid,text,text,text) to service_role;
-- Server-only challenge completion. Wrong codes increment attempts durably, without exception rollback.
create function public.connect_verify(ident uuid,u uuid,hash text,dest text default null,lookup_hash text default null) returns boolean language plpgsql security definer set search_path='' as $$declare c public.connect_connections;begin
select * into c from public.connect_connections where id=ident for update;
if not found or (u is not null and c.user_id<>u) or c.status<>'pending' or c.expires_at<now() or c.attempts>=5 or not public.connect_allowed(c.user_id,c.workspace_id) then return false;end if;
if c.challenge_hash<>hash then update public.connect_connections set attempts=attempts+1 where id=ident;return false;end if;
if c.channel='telegram' and (dest is null or lookup_hash is null) then return false;end if;
update public.connect_connections set status='verified',challenge_hash=null,verified_at=now(),updated_at=now(),destination_encrypted=coalesce(dest,destination_encrypted),destination_hash=coalesce(lookup_hash,destination_hash) where id=ident;return true;end;$$;
revoke all on function public.connect_verify(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.connect_verify(uuid,uuid,text,text,text) to service_role;
create function public.connect_pending(hash text) returns uuid language sql security definer set search_path='' as $$select id from public.connect_connections where challenge_hash=hash and status='pending' and expires_at>now() limit 1$$;
revoke all on function public.connect_pending(text) from public,anon,authenticated;
grant execute on function public.connect_pending(text) to service_role;
create function public.connect_fanout() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.channel='inapp' and new.logical_key not like 'test:%' then
insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload,connection_id) select new.user_id,new.workspace_id,new.logical_key||':'||c.id::text,c.channel,new.payload,c.id from public.connect_connections c where c.user_id=new.user_id and c.workspace_id=new.workspace_id and c.status='verified' on conflict do nothing;end if;return new;end;$$;
revoke all on function public.connect_fanout() from public,anon,authenticated;
create trigger connect_fanout after insert on public.connect_deliveries for each row execute function public.connect_fanout();
create function public.connect_channel_test(w uuid,c uuid) returns void language plpgsql security definer set search_path='' as $$declare conn public.connect_connections;begin
if auth.uid() is null or not public.connect_allowed(auth.uid(),w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
select * into conn from public.connect_connections where id=c and user_id=auth.uid() and workspace_id=w and status='verified';if not found then raise exception 'UNVERIFIED';end if;
perform pg_advisory_xact_lock(hashtext(auth.uid()::text||'connect'));
if exists(select 1 from public.connect_deliveries where user_id=auth.uid() and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMIT';end if;
insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,connection_id,payload) values(auth.uid(),w,'test:'||gen_random_uuid()::text,conn.channel,c,jsonb_build_object('title','Notifikasi uji'));end;$$;
revoke all on function public.connect_channel_test(uuid,uuid) from public,anon;
grant execute on function public.connect_channel_test(uuid,uuid) to authenticated;
create function public.connect_claim() returns jsonb language plpgsql security definer set search_path='' as $$declare d public.connect_deliveries;c public.connect_connections;lease uuid:=gen_random_uuid();plan text;lim bigint;n bigint;begin
select * into d from public.connect_deliveries where channel<>'inapp' and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) order by next_attempt_at for update skip locked limit 1;
if not found then return null;end if;
select * into c from public.connect_connections where id=d.connection_id and user_id=d.user_id and workspace_id=d.workspace_id and status='verified';
if not found or not public.connect_allowed(d.user_id,d.workspace_id) then update public.connect_deliveries set status='cancelled' where id=d.id;return null;end if;
perform pg_advisory_xact_lock(hashtext(d.user_id::text||'connect'));
select coalesce((select plan_id from public.subscriptions where user_id=d.user_id and status in('active','trialing') and (current_period_end is null or current_period_end>now()) limit 1),'free') into plan;
select monthly_limit into lim from public.plan_entitlements where plan_id=plan and capability='connect';
select coalesce(sum(quantity),0)+(select count(*) from public.connect_deliveries where user_id=d.user_id and status='processing' and id<>d.id) into n from public.usage_events where user_id=d.user_id and app_id='connect' and created_at>=date_trunc('month',now());
if (lim is not null and n>=lim) or d.attempt_count>=5 then update public.connect_deliveries set status='dead_letter',last_error_code='LIMIT_OR_ATTEMPTS' where id=d.id;return null;end if;
update public.connect_deliveries set status='processing',lease_id=lease,lease_until=now()+interval '90 seconds',attempt_count=attempt_count+1 where id=d.id;
return jsonb_build_object('id',d.id,'lease',lease,'channel',d.channel,'workspace_id',d.workspace_id,'destination',c.destination_encrypted,'payload',d.payload);end;$$;
revoke all on function public.connect_claim() from public,anon,authenticated;
grant execute on function public.connect_claim() to service_role;
create function public.connect_finish(ident uuid,lease uuid,accepted boolean,retryable boolean,provider_id text,error_code text,retry_after int default 0) returns void language plpgsql security definer set search_path='' as $$declare d public.connect_deliveries;begin
select * into d from public.connect_deliveries where id=ident and lease_id=lease and status='processing' for update;if not found then return;end if;
insert into public.connect_delivery_attempts(delivery_id,status) values(ident,case when accepted then 'accepted' else 'failed' end);
update public.connect_deliveries set status=case when accepted then 'accepted' when retryable and attempt_count<5 then 'pending' else 'dead_letter' end,provider_message_id=left(provider_id,200),last_error_code=left(error_code,80),lease_until=null,next_attempt_at=now()+make_interval(secs=>greatest(least(coalesce(retry_after,0),3600),case attempt_count when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end)) where id=ident;
if error_code='SUBSCRIPTION_EXPIRED' then update public.connect_connections set status='revoked',destination_encrypted=null where id=d.connection_id;end if;
if accepted then insert into public.usage_events(user_id,workspace_id,app_id,metric) values(d.user_id,d.workspace_id,'connect','connect.delivery.accepted');end if;end;$$;
revoke all on function public.connect_finish(uuid,uuid,boolean,boolean,text,text,int) from public,anon,authenticated;
grant execute on function public.connect_finish(uuid,uuid,boolean,boolean,text,text,int) to service_role;
alter table public.connect_preferences add column immediate_enabled boolean not null default false;
create or replace function public.connect_action(w uuid,action text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();pref public.connect_preferences;tz text;tm time;n timestamptz;begin
 if u is null or not public.connect_allowed(u,w) then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 if octet_length(p::text)>4000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext(u::text||'connect'));
 if action='save' then
 tz:=coalesce(p->>'timezone','Asia/Jakarta');if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_TIMEZONE';end if;
 tm:=(p->>'local_time')::time;if tm is null then raise exception 'INVALID_TIME';end if;
 n:=((now() at time zone tz)::date+tm) at time zone tz;if n<=now() then n:=(((now() at time zone tz)::date+1)+tm) at time zone tz;end if;
 insert into public.connect_preferences(user_id,workspace_id,enabled,domains,local_time,timezone,next_run_at) values(u,w,coalesce((p->>'enabled')::boolean,false),array(select jsonb_array_elements_text(p->'domains')),tm,tz,n) on conflict(user_id,workspace_id) do update set enabled=excluded.enabled,domains=excluded.domains,local_time=excluded.local_time,timezone=excluded.timezone,next_run_at=excluded.next_run_at,updated_at=now();
 update public.connect_preferences set immediate_enabled=coalesce((p->>'immediate_enabled')::boolean,false) where user_id=u and workspace_id=w;
 if not (p->>'enabled')::boolean then update public.connect_deliveries set status='cancelled' where user_id=u and workspace_id=w and status='pending';end if;
 elsif action='read' then update public.connect_notifications set read_at=now() where user_id=u and workspace_id=w and (p->>'id' is null or id=(p->>'id')::uuid);
 elsif action='test' then
 if exists(select 1 from public.connect_deliveries where user_id=u and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMIT';end if;
 insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload) values(u,w,'test:'||u::text||':'||gen_random_uuid()::text,'inapp',jsonb_build_object('title','Notifikasi uji','message','PRCUISA Connect siap menerima notifikasi dalam aplikasi.'));
 elsif action='preview' then select * into pref from public.connect_preferences where user_id=u and workspace_id=w;return public.connect_report(w,now(),coalesce(pref.timezone,'Asia/Jakarta'),coalesce(pref.domains,array['sales','finance','invoice','qr']));
 elsif action<>'read_state' then raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('channels',(select jsonb_agg(c) from public.connect_channels c),'preference',(select to_jsonb(s) from public.connect_preferences s where user_id=u and workspace_id=w),'notifications',coalesce((select jsonb_agg(x) from(select id,payload,read_at,created_at from public.connect_notifications where user_id=u and workspace_id=w order by created_at desc limit 25)x),'[]'::jsonb),'deliveries',coalesce((select jsonb_agg(x) from(select id,channel,status,attempt_count,created_at from public.connect_deliveries where user_id=u and workspace_id=w order by created_at desc limit 25)x),'[]'::jsonb));
end;$$;
create or replace function public.connect_tick() returns integer language plpgsql security definer set search_path='' as $$
declare ev public.connect_event_outbox;s public.connect_preferences;d public.connect_deliveries;r uuid;snap jsonb;n integer:=0;lim bigint;used bigint;plan text;begin
 for ev in select * from public.connect_event_outbox where processed_at is null order by occurred_at for update skip locked limit 100 loop
 insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload)
 select p.user_id,p.workspace_id,'event:'||ev.id::text||':'||p.user_id::text,'inapp',jsonb_build_object('title','Aktivitas bisnis baru','message',case ev.source_app when 'kasir-pinter' then 'Penjualan baru dicatat di Kasir Pinter.' when 'invoice-quotation' then 'Ada perubahan dokumen atau pembayaran di Invoice & Quotation.' when 'qr' then 'Desain QR baru disimpan.' else 'Pemasukan atau pengeluaran baru dicatat.' end)
 from public.connect_preferences p where p.workspace_id=ev.workspace_id and p.immediate_enabled and p.updated_at<=ev.occurred_at and public.connect_allowed(p.user_id,p.workspace_id) and (case ev.source_app when 'kasir-pinter' then 'sales' when 'invoice-quotation' then 'invoice' when 'qr' then 'qr' else 'finance' end)=any(p.domains) on conflict do nothing;
 update public.connect_event_outbox set processed_at=now() where id=ev.id;
 end loop;
 for s in select * from public.connect_preferences where enabled and next_run_at<=now() order by next_run_at for update skip locked limit 50 loop
 if public.connect_allowed(s.user_id,s.workspace_id) then
 snap:=public.connect_report(s.workspace_id,s.next_run_at,s.timezone,s.domains);
 if s.last_run_at is not null and s.last_run_at < date_trunc('day',s.next_run_at at time zone s.timezone) at time zone s.timezone then
 snap:=snap||jsonb_build_object('previous_tail',public.connect_report(s.workspace_id,date_trunc('day',s.next_run_at at time zone s.timezone) at time zone s.timezone,s.timezone,s.domains,s.last_run_at)||jsonb_build_object('title','Aktivitas setelah laporan sebelumnya'));
 end if;
 insert into public.connect_report_runs(user_id,workspace_id,cutoff,snapshot) values(s.user_id,s.workspace_id,s.next_run_at,snap) on conflict do nothing returning id into r;
 if r is not null then insert into public.connect_deliveries(user_id,workspace_id,logical_key,channel,payload) values(s.user_id,s.workspace_id,r::text||':inapp','inapp',snap) on conflict do nothing;end if;
 end if;
 update public.connect_preferences set last_run_at=next_run_at,next_run_at=(((next_run_at at time zone s.timezone)::date+1)+s.local_time) at time zone s.timezone where user_id=s.user_id and workspace_id=s.workspace_id;
 end loop;
 for d in select * from public.connect_deliveries where status='pending' and channel='inapp' and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 100 loop
 if not public.connect_allowed(d.user_id,d.workspace_id) then update public.connect_deliveries set status='cancelled' where id=d.id;continue;end if;
 perform pg_advisory_xact_lock(hashtext(d.user_id::text||'connect'));
 select coalesce((select plan_id from public.subscriptions where user_id=d.user_id and status in('active','trialing') and (current_period_end is null or current_period_end>now()) limit 1),'free') into plan;
 select monthly_limit into lim from public.plan_entitlements where plan_id=plan and capability='connect';
 select coalesce(sum(quantity),0)+(select count(*) from public.connect_deliveries where user_id=d.user_id and status='processing') into used from public.usage_events where user_id=d.user_id and app_id='connect' and created_at>=date_trunc('month',now());
 if lim is not null and used>=lim then update public.connect_deliveries set status='cancelled' where id=d.id;continue;end if;
 insert into public.connect_notifications(delivery_id,user_id,workspace_id,payload) values(d.id,d.user_id,d.workspace_id,d.payload) on conflict do nothing;
 insert into public.connect_delivery_attempts(delivery_id,status) values(d.id,'delivered');
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(d.user_id,d.workspace_id,'connect','connect.delivery.accepted');
 update public.connect_deliveries set status='delivered',attempt_count=attempt_count+1 where id=d.id;n:=n+1;
 end loop;return n;end;$$;
create table public.connect_audit_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,workspace_id uuid not null references public.workspaces(id) on delete cascade,connection_id uuid not null references public.connect_connections(id) on delete cascade,event text not null,created_at timestamptz not null default now());
alter table public.connect_audit_logs enable row level security;
revoke all on public.connect_audit_logs from public,anon,authenticated;
create function public.connect_audit_connection() returns trigger language plpgsql security definer set search_path='' as $$begin
if tg_op='INSERT' or old.status is distinct from new.status then insert into public.connect_audit_logs(user_id,workspace_id,connection_id,event) values(new.user_id,new.workspace_id,new.id,'connection_'||new.status);end if;return new;end;$$;
revoke all on function public.connect_audit_connection() from public,anon,authenticated;
create trigger connect_audit_connection after insert or update on public.connect_connections for each row execute function public.connect_audit_connection();
commit;
-- Routine engagement is based on completed tool value on distinct Jakarta-local
-- dates. Opens are reported separately and never count as active usage.
create index if not exists platform_events_completed_time_app_user_workspace
 on public.platform_events(created_at,app_id,user_id,workspace_id)
 where name='tool_value_completed';
create index if not exists platform_events_open_time_app
 on public.platform_events(created_at,app_id)
 where name='tool_opened';

create or replace function public.admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_platform_admin() then
  raise exception 'UNAUTHORIZED' using errcode='42501';
 end if;
 return jsonb_build_object(
  'apps',coalesce((select jsonb_agg(a order by a.created_at) from public.apps a),'[]'::jsonb),
  'entitlements',coalesce((select jsonb_agg(e order by e.plan_id,e.capability) from public.plan_entitlements e),'[]'::jsonb),
  'billing',coalesce((select jsonb_agg(p order by p.plan_id) from public.billing_plans p),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(r) from(select id,problem,workflow,frequency,status,group_id,created_at from public.tool_requests order by created_at desc limit 100)r),'[]'::jsonb),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'description',g.description,'status',g.status,'is_public',g.is_public,'app_id',g.app_id,'requests',(select count(*) from public.tool_requests r where r.group_id=g.id),'votes',(select count(*) from public.tool_request_votes v where v.group_id=g.id))) from public.request_groups g),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(a) from(select action,details,created_at from public.admin_audit_events order by created_at desc limit 30)a),'[]'::jsonb),
  'analytics',jsonb_build_object(
   'definition','Rutin aktif = minimal satu hasil tool selesai pada dua tanggal WIB berbeda dalam 7 hari terakhir. Pembukaan tool dan page hit dilaporkan terpisah.',
   'routine_users_7d',(select count(*) from(select user_id from public.platform_events where name='tool_value_completed' and created_at>=now()-interval '7 days' group by user_id having count(distinct (created_at at time zone 'Asia/Jakarta')::date)>=2) q),
   'routine_workspaces_7d',(select count(*) from(select workspace_id from public.platform_events where name='tool_value_completed' and created_at>=now()-interval '7 days' group by workspace_id having count(distinct (created_at at time zone 'Asia/Jakarta')::date)>=2) q),
   'completed_values_7d',(select count(*) from public.platform_events where name='tool_value_completed' and created_at>=now()-interval '7 days'),
   'tool_opens_30d',(select count(*) from public.platform_events where name='tool_opened' and created_at>=now()-interval '30 days'),
   'requests_30d',(select count(*) from public.tool_requests where created_at>=now()-interval '30 days'),
   'tools',coalesce((select jsonb_agg(jsonb_build_object(
      'app_id',a.slug,'name',a.name,
      'opens_30d',(select count(*) from public.platform_events e where e.app_id=a.slug and e.name='tool_opened' and e.created_at>=now()-interval '30 days'),
      'completed_30d',(select count(*) from public.platform_events e where e.app_id=a.slug and e.name='tool_value_completed' and e.created_at>=now()-interval '30 days'),
      'users_30d',(select count(distinct e.user_id) from public.platform_events e where e.app_id=a.slug and e.name='tool_value_completed' and e.created_at>=now()-interval '30 days'),
      'routine_users_7d',(select count(*) from(select e.user_id from public.platform_events e where e.app_id=a.slug and e.name='tool_value_completed' and e.created_at>=now()-interval '7 days' group by e.user_id having count(distinct (e.created_at at time zone 'Asia/Jakarta')::date)>=2) q)
    ) order by a.name) from public.apps a where a.status in('active','beta') and a.is_public),'[]'::jsonb),
   'requests_by_status',coalesce((select jsonb_object_agg(status,total) from(select status,count(*) total from public.tool_requests where created_at>=now()-interval '30 days' group by status) q),'{}'::jsonb),
   'daily_values_14d',coalesce((select jsonb_agg(jsonb_build_object('date',calendar.local_date,'count',coalesce(events.total,0)) order by calendar.local_date) from generate_series(((now() at time zone 'Asia/Jakarta')::date-13)::timestamp,(now() at time zone 'Asia/Jakarta')::date::timestamp,interval '1 day') as calendar(local_date) left join (select (created_at at time zone 'Asia/Jakarta')::date as local_date,count(*) as total from public.platform_events where name='tool_value_completed' and created_at>=now()-interval '14 days' group by 1) events using(local_date)),'[]'::jsonb)
  )
 );
end;$$;
revoke all on function public.admin_snapshot() from public,anon;
grant execute on function public.admin_snapshot() to authenticated;

-- Only a coarse, thresholded aggregate is public. No names, emails, workspace
-- identifiers, or exact low-volume counts are returned.
create or replace function public.public_routine_usage_proof()
returns jsonb language sql stable security definer set search_path=''
as $$
 with active as (
  select user_id
  from public.platform_events e
  join public.apps a on a.slug=e.app_id and a.is_public and a.status in('active','beta')
  where e.name='tool_value_completed' and e.created_at>=now()-interval '7 days'
  group by user_id
  having count(distinct (e.created_at at time zone 'Asia/Jakarta')::date)>=2
 ), total as (select count(*) n from active)
 select jsonb_build_object(
   'available',n>=10,
   'user_bucket',case when n>=10 then (n/10)*10 else 0 end,
   'window_days',7,
   'activity_days_required',2
 ) from total;
$$;
revoke all on function public.public_routine_usage_proof() from public;
grant execute on function public.public_routine_usage_proof() to anon,authenticated;
