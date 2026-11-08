-- Administrative reporting queries only. Do not expose auth.users in a public view.
-- Activation + time to value (one row per workspace).
select w.id, w.created_at as workspace_created_at,
 min(t.created_at) as first_transaction_at,
 extract(epoch from (min(t.created_at)-w.created_at)) as seconds_to_first_transaction,
 count(t.id) as transactions,
 count(distinct (t.created_at at time zone 'Asia/Jakarta')::date) as transaction_days
from public.workspaces w left join public.transactions t on t.workspace_id=w.id
group by w.id;
-- Weekly activation: signup cohort and first workspace, using owner ID.
select date_trunc('week',u.created_at) as signup_week,
 count(distinct u.id) as signed_up,
 count(distinct w.owner_id) as created_workspace,
 count(distinct case when t.id is not null then w.owner_id end) as activated
from auth.users u left join public.workspaces w on w.owner_id=u.id
left join public.transactions t on t.workspace_id=w.id
group by 1 order by 1;
-- Returning workspaces: opens on at least two distinct dates.
select workspace_id, count(distinct (created_at at time zone 'Asia/Jakarta')::date) as active_days
from public.activity_events where name='workspace_opened'
group by workspace_id having count(distinct (created_at at time zone 'Asia/Jakarta')::date)>1;

-- v1.1 PRIMARY METRIC: Weekly Active Business. Creation timestamp measures usage;
-- the user's selected transaction date must not shift behavioral cohorts.
select date_trunc('week', created_at at time zone 'Asia/Jakarta')::date as week,
 count(distinct workspace_id) as weekly_active_business,
 count(*) as records,
 count(*)::numeric / nullif(count(distinct workspace_id),0) as records_per_active_business
from public.transactions group by 1 order by 1;

-- First Record Rate and Time to First Value, per created-business cohort.
with activation as (
 select w.id,w.created_at,min(t.created_at) as first_record
 from public.workspaces w left join public.transactions t on t.workspace_id=w.id group by w.id
)
select date_trunc('week',created_at at time zone 'Asia/Jakarta')::date as cohort,
 count(*) as businesses_created,count(first_record) as businesses_activated,
 count(first_record)::numeric / nullif(count(*),0) as first_record_rate,
 percentile_cont(0.5) within group(order by extract(epoch from (first_record-created_at))) as median_seconds_to_value
from activation group by 1 order by 1;

-- Week 1 retention: first recorded week → next calendar week; hide immature cohorts.
with active as (
 select distinct workspace_id,date_trunc('week',created_at at time zone 'Asia/Jakarta')::date as week from public.transactions
), cohorts as (select workspace_id,min(week) as cohort from active group by 1)
select c.cohort,count(*) as activated_businesses,count(a.workspace_id) as week_1_returners,
 count(a.workspace_id)::numeric/nullif(count(*),0) as week_1_retention
from cohorts c left join active a on a.workspace_id=c.workspace_id and a.week=c.cohort+7
where c.cohort+14<=date_trunc('week',now() at time zone 'Asia/Jakarta')::date
group by 1 order by 1;

-- Repeat Recording Rate: two or more separate recording days within each week.
with days as (select workspace_id,date_trunc('week',created_at at time zone 'Asia/Jakarta')::date as week,
 count(distinct (created_at at time zone 'Asia/Jakarta')::date) as days from public.transactions group by 1,2)
select week,count(*) as active_businesses,count(*) filter(where days>=2)::numeric/nullif(count(*),0) as repeat_recording_rate
from days group by 1 order by 1;
