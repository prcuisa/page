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
