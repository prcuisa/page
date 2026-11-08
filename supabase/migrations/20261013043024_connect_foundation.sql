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
