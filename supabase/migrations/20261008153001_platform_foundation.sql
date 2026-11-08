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
