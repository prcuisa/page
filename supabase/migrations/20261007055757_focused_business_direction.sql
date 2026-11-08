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
