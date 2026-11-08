-- Operator-only queries; never expose cross-tenant analytics to clients.
-- Meaningful weekly usage is a tool value event, not a page view.
select date_trunc('week',created_at at time zone 'Asia/Jakarta') as week,
 count(distinct user_id) as weekly_active_ids,
 count(distinct workspace_id) as weekly_active_workspaces,
 count(*) as value_actions
from public.usage_events group by 1 order by 1 desc;

-- Activated IDs and repeat value by actual tool usage.
select app_id,count(distinct user_id) as activated_ids,count(*) as value_actions
from public.usage_events group by app_id;

-- Multi-tool adoption among IDs receiving value in the last 7 days.
with per_person as (
 select user_id,count(distinct app_id) as tools,count(*) as uses
 from public.usage_events where created_at>=now()-interval '7 days' group by user_id
) select count(*) as active_ids,count(*) filter(where tools>1) as multi_tool_ids,
 round(100.0*count(*) filter(where tools>1)/nullif(count(*),0),2) as multi_tool_percent,
 count(*) filter(where uses>1) as repeat_ids from per_person;

-- Tool conversion: unique openers versus actual value users in the same period.
with opened as (select app_id,count(distinct user_id) as people from public.platform_events
 where name='tool_opened' and created_at>=now()-interval '7 days' group by app_id),
 valued as (select app_id,count(distinct user_id) as people from public.usage_events
 where created_at>=now()-interval '7 days' group by app_id)
select a.slug,coalesce(o.people,0) as openers,coalesce(v.people,0) as value_users
from public.apps a left join opened o on o.app_id=a.slug left join valued v on v.app_id=a.slug;
-- Checkout/conversion/retention queries follow only when a genuine payment lifecycle exists.
