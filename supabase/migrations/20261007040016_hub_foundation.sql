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
