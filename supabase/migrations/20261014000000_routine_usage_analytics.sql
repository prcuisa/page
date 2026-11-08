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
