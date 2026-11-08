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
