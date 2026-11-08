begin;
alter table public.platform_events drop constraint platform_events_name_check;
alter table public.platform_events add constraint platform_events_name_check check(name in('hub_viewed','tool_opened','second_tool_opened','tool_favorited','tool_value_completed','tool_request_submitted','upgrade_viewed','upgrade_clicked','tool_searched','member_invited','member_joined','member_removed','member_role_changed','invitation_revoked','request_voted','kasir_product_saved','kasir_receipt_share','kasir_receipt_revoke'));
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords)
values('kasir-pinter','Kasir Pinter','Catat penjualan, hitung kembalian, dan bagikan struk lewat QR.','Bisnis','kasir','/tools/kasir-pinter','beta','included','free',true,true,'kasir pos warung toko fnb penjualan struk receipt qr pembayaran') on conflict(slug) do nothing;
insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit) select id,'kasir-pinter',true,null from public.plans on conflict do nothing;
create table public.kasir_products(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),name text not null check(length(trim(name)) between 1 and 100),category text not null default '' check(length(category)<=60),price bigint not null check(price between 0 and 1000000000),active boolean not null default true,unique(workspace_id,id));
create table public.kasir_sales(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),created_by uuid not null references auth.users(id),idempotency_key uuid not null,receipt jsonb not null,created_at timestamptz not null default now(),unique(workspace_id,idempotency_key),unique(workspace_id,id));
create index kasir_sales_time on public.kasir_sales(workspace_id,created_at desc);
create index kasir_products_workspace on public.kasir_products(workspace_id,name);
create table public.kasir_sequences(workspace_id uuid primary key references public.workspaces(id),n bigint not null);
create table public.kasir_shares(sale_id uuid primary key,workspace_id uuid not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,foreign key(workspace_id,sale_id) references public.kasir_sales(workspace_id,id));
alter table public.kasir_shares enable row level security;
alter table public.kasir_sequences enable row level security;
alter table public.kasir_sales enable row level security;
alter table public.kasir_products enable row level security;
revoke all on public.kasir_products,public.kasir_sales,public.kasir_sequences,public.kasir_shares from public,anon,authenticated;
-- No Data API table access: authorized, bounded RPCs are the only boundary.
create function public.kasir_access(w uuid,writing boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;begin
 if auth.uid() is null or public.workspace_role(w) is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 a:=public.platform_access(w,'kasir-pinter');
 if not coalesce((a->>'enabled')::boolean,false) then raise exception 'ACCESS_BLOCKED' using errcode='42501';end if;
 if writing and public.workspace_role(w) not in('owner','editor') then raise exception 'READ_ONLY' using errcode='42501';end if;
 return a;end;$$;
revoke all on function public.kasir_access(uuid,boolean) from public,anon,authenticated;
create function public.kasir_read(w uuid,section text default 'products',q text default '',page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone text;begin
 perform public.kasir_access(w);
 if section not in('products','sales','summary') or page is null or page not between 0 and 100000 or q is null or length(q)>120 then raise exception 'INVALID_INPUT';end if;
 if section='products' then return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from(select * from public.kasir_products where workspace_id=w and (name ilike '%'||q||'%' or category ilike '%'||q||'%') order by name,id limit 25 offset page*25)x),'[]'::jsonb));end if;
 if section='sales' then return jsonb_build_object('rows',coalesce((select jsonb_agg(x) from(select id,receipt,created_at from public.kasir_sales where workspace_id=w and receipt->>'number' ilike '%'||q||'%' order by created_at desc,id limit 25 offset page*25)x),'[]'::jsonb));end if;
 select timezone into zone from public.workspaces where id=w;
 return jsonb_build_object('count',(select count(*) from public.kasir_sales where workspace_id=w and (created_at at time zone zone)::date=(now() at time zone zone)::date),'total',(select coalesce(sum((receipt->>'total')::bigint),0) from public.kasir_sales where workspace_id=w and (created_at at time zone zone)::date=(now() at time zone zone)::date),'top',coalesce((select jsonb_agg(x) from(select item->>'name' as name,sum((item->>'quantity')::bigint) as quantity from public.kasir_sales s cross join lateral jsonb_array_elements(s.receipt->'items') item where s.workspace_id=w and (s.created_at at time zone zone)::date=(now() at time zone zone)::date group by item->>'name' order by quantity desc,name limit 5)x),'[]'::jsonb));
end;$$;
revoke all on function public.kasir_read(uuid,text,text,integer) from public,anon;
grant execute on function public.kasir_read(uuid,text,text,integer) to authenticated;
create function public.kasir_action(w uuid,action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;u uuid:=auth.uid();prod public.kasir_products;prior public.kasir_sales;item jsonb;lines jsonb:='[]';q bigint;sub bigint:=0;disc bigint;total bigint;tender bigint;number bigint;business text;currency text;id uuid;receipt jsonb;method text;begin
 a:=public.kasir_access(w,true);
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>16000 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 perform pg_advisory_xact_lock(hashtext(w::text));
 if action='checkout' then
 select * into prior from public.kasir_sales where workspace_id=w and idempotency_key=(p->>'key')::uuid;
 if found then return jsonb_build_object('id',prior.id,'receipt',prior.receipt,'created_at',prior.created_at);end if;
 end if;
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT';end if;
 if action='product' then
 if coalesce(length(trim(p->>'name')),0) not between 1 and 100 or length(coalesce(p->>'category',''))>60 or coalesce(p->>'price','') !~ '^[0-9]{1,10}$' or (p->>'price')::bigint>1000000000 then raise exception 'INVALID_INPUT';end if;
 if p->>'id' is not null then
 update public.kasir_products set name=trim(p->>'name'),category=coalesce(p->>'category',''),price=(p->>'price')::bigint,active=coalesce((p->>'active')::boolean,true) where workspace_id=w and kasir_products.id=(p->>'id')::uuid returning * into prod;
 if not found then raise exception 'NOT_FOUND';end if;
 else insert into public.kasir_products(workspace_id,name,category,price) values(w,trim(p->>'name'),coalesce(p->>'category',''),(p->>'price')::bigint) returning * into prod;end if;
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','kasir_product_saved');return to_jsonb(prod);
 elsif action='checkout' then
 -- Re-read access under the account quota lock.
 a:=public.kasir_access(w,true);
 if a->>'monthly_limit' is not null and (a->>'used')::bigint >= (a->>'monthly_limit')::bigint then raise exception 'USAGE_LIMIT';end if;
 select name,workspaces.currency into business,currency from public.workspaces where workspaces.id=w;
 if currency<>'IDR' then raise exception 'IDR_REQUIRED';end if;
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 or coalesce(p->>'key','')='' then raise exception 'INVALID_INPUT';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p->'items'))<>jsonb_array_length(p->'items') then raise exception 'INVALID_INPUT';end if;
 for item in select value from jsonb_array_elements(p->'items') loop
 if coalesce(item->>'quantity','') !~ '^[0-9]{1,4}$' or (item->>'quantity')::bigint<1 then raise exception 'INVALID_INPUT';end if;
 q:=(item->>'quantity')::bigint;
 select * into prod from public.kasir_products where workspace_id=w and kasir_products.id=(item->>'id')::uuid and active;
 if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if (item->>'price')::bigint is distinct from prod.price then raise exception 'PRICE_CHANGED';end if;
 sub:=sub+q*prod.price;lines:=lines||jsonb_build_array(jsonb_build_object('name',prod.name,'quantity',q,'price',prod.price,'total',q*prod.price));end loop;
 if coalesce(p->>'discount','') !~ '^[0-9]{1,10}$' or coalesce(p->>'tendered','') !~ '^[0-9]{1,13}$' then raise exception 'INVALID_INPUT';end if;
 disc:=(p->>'discount')::bigint;total:=sub-disc;tender:=(p->>'tendered')::bigint;method:=p->>'method';
 if sub>1000000000000 or disc>1000000000 or disc>sub or tender>1000000000000 or tender<total or method is null or method not in('cash','transfer','qris') or (method<>'cash' and tender<>total) then raise exception 'INVALID_PAYMENT';end if;
 insert into public.kasir_sequences(workspace_id,n) values(w,1) on conflict(workspace_id) do update set n=kasir_sequences.n+1 returning n into number;
 receipt:=jsonb_build_object('number','KP-'||lpad(number::text,greatest(8,length(number::text)),'0'),'business',business,'date',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'items',lines,'subtotal',sub,'discount',disc,'total',total,'method',method,'tendered',tender,'change',tender-total);
 insert into public.kasir_sales(workspace_id,created_by,idempotency_key,receipt) values(w,u,(p->>'key')::uuid,receipt) returning kasir_sales.id into id;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(u,w,'kasir-pinter','sale_completed');
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','tool_value_completed');return jsonb_build_object('id',id,'receipt',receipt,'created_at',now());
 elsif action in('share','revoke') then
 if not exists(select 1 from public.kasir_sales where workspace_id=w and kasir_sales.id=(p->>'id')::uuid) then raise exception 'NOT_FOUND';end if;
 if action='revoke' then delete from public.kasir_shares where workspace_id=w and sale_id=(p->>'id')::uuid;
 else
 if coalesce(p->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 insert into public.kasir_shares(sale_id,workspace_id,token_hash,expires_at) values((p->>'id')::uuid,w,p->>'hash',now()+interval '30 days') on conflict(sale_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
 end if;
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,w,'kasir-pinter','kasir_receipt_'||action);return jsonb_build_object('ok',true);
 else raise exception 'INVALID_ACTION';end if;
end;$$;
revoke all on function public.kasir_action(uuid,text,jsonb) from public,anon;
grant execute on function public.kasir_action(uuid,text,jsonb) to authenticated;
-- Only the server can look up a bearer receipt token. No public table or list access.
create function public.kasir_receipt(token_hash text) returns jsonb language sql stable security definer set search_path='' as $$select s.receipt from public.kasir_shares t join public.kasir_sales s on s.id=t.sale_id and s.workspace_id=t.workspace_id where t.token_hash=$1 and t.expires_at>now() and $1 ~ '^[a-f0-9]{64}$'$$;
revoke all on function public.kasir_receipt(text) from public,anon,authenticated;
grant execute on function public.kasir_receipt(text) to service_role;
commit;
