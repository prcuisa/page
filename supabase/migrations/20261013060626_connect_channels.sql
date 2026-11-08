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
