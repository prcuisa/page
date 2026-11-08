begin;
insert into public.apps(slug,name,description,category,icon,launch_url,status,access_type,minimum_plan,is_featured,is_public,keywords)
values('invoice','Invoice','Buat, hitung, dan simpan invoice bisnis.','Bisnis','invoice','/tools/invoice','active','free','free',true,true,'invoice faktur tagihan buat invoice klien barang jasa pajak diskon')
on conflict(slug) do update set name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,launch_url=excluded.launch_url,status='active',access_type='free',minimum_plan='free',is_featured=true,is_public=true,keywords=excluded.keywords,updated_at=now();
insert into public.plan_entitlements(plan_id,capability,enabled,monthly_limit)
select id,'invoice',true,null from public.plans on conflict(plan_id,capability) do update set enabled=true,monthly_limit=null;

create table public.invoices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 invoice_number text not null check(char_length(trim(invoice_number)) between 1 and 50),
 invoice_date date not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=3000000),
 subtotal bigint not null check(subtotal>=0),
 discount bigint not null check(discount>=0),
 tax bigint not null check(tax>=0),
 total bigint not null check(total>=0),
 created_at timestamptz not null default now(),
 unique(workspace_id,invoice_number)
);
create index invoices_workspace_time on public.invoices(workspace_id,created_at desc);
alter table public.invoices enable row level security;
create policy invoices_read on public.invoices for select to authenticated using(
 user_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and (w.owner_id=(select auth.uid()) or exists(select 1 from public.workspace_members m where m.workspace_id=w.id and m.user_id=(select auth.uid()))))
);
revoke all on public.invoices from public,anon,authenticated;
grant select on public.invoices to authenticated;

-- Invoice amounts are recomputed server-side from the submitted line items.
-- The authenticated identity and workspace membership are never caller supplied.
create function public.save_invoice(p_workspace uuid,p_invoice_number text,p_invoice_date date,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); access jsonb; row_item jsonb; qty numeric; price numeric;
 sub numeric:=0; disc numeric:=0; tax_amount numeric:=0; grand numeric:=0;
 tax_rate numeric:=0; discount_rate numeric:=0; saved public.invoices;
begin
 if u is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 access:=public.platform_access(p_workspace,'invoice');
 if not coalesce((access->>'enabled')::boolean,false) then raise exception 'ACCESS_BLOCKED' using errcode='42501'; end if;
 if access->>'monthly_limit' is not null and (access->>'used')::bigint >= (access->>'monthly_limit')::bigint then raise exception 'USAGE_LIMIT'; end if;
 if (select count(*) from public.platform_events where user_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'RATE_LIMIT'; end if;
 if p_invoice_number is null or char_length(trim(p_invoice_number)) not between 1 and 50 or p_invoice_date is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>3000000 then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(jsonb_typeof(p_payload->'sender'),'')<>'object' or coalesce(jsonb_typeof(p_payload->'client'),'')<>'object' or coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' then raise exception 'INVALID_INVOICE'; end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(p_payload->'sender'->>'name','')='' or char_length(p_payload->'sender'->>'name')>120 or char_length(coalesce(p_payload->'sender'->>'address',''))>500 or char_length(coalesce(p_payload->'sender'->>'email',''))>254 or char_length(coalesce(p_payload->'client'->>'name',''))>120 or char_length(coalesce(p_payload->'client'->>'address',''))>500 or char_length(coalesce(p_payload->'client'->>'email',''))>254 or char_length(coalesce(p_payload->>'notes',''))>1000 then raise exception 'INVALID_INVOICE'; end if;
 if p_payload->>'logo_data_url' is not null and (char_length(p_payload->>'logo_data_url')>2800000 or p_payload->>'logo_data_url' !~ '^data:image/(png|jpeg|webp|svg\+xml|gif);base64,') then raise exception 'INVALID_INVOICE'; end if;
 if coalesce(p_payload->>'tax_rate','0') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' or coalesce(p_payload->>'discount_rate','0') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'INVALID_INVOICE'; end if;
 tax_rate:=coalesce((p_payload->>'tax_rate')::numeric,0); discount_rate:=coalesce((p_payload->>'discount_rate')::numeric,0);
 if tax_rate>100 or discount_rate>100 then raise exception 'INVALID_INVOICE'; end if;
 for row_item in select value from jsonb_array_elements(p_payload->'items') loop
  if jsonb_typeof(row_item)<>'object' or coalesce(row_item->>'description','')='' or char_length(row_item->>'description')>160 then raise exception 'INVALID_INVOICE'; end if;
  if coalesce(row_item->>'quantity','') !~ '^[0-9]{1,6}$' or coalesce(row_item->>'unit_price','') !~ '^[0-9]{1,12}$' then raise exception 'INVALID_INVOICE'; end if;
  qty:=(row_item->>'quantity')::numeric; price:=(row_item->>'unit_price')::numeric;
  if qty<1 or price<0 then raise exception 'INVALID_INVOICE'; end if;
  sub:=sub+qty*price;
 end loop;
 if sub>9000000000000000 then raise exception 'INVALID_INVOICE'; end if;
 disc:=round(sub*discount_rate/100); tax_amount:=round((sub-disc)*tax_rate/100); grand:=sub-disc+tax_amount;
 insert into public.invoices(user_id,workspace_id,invoice_number,invoice_date,payload,subtotal,discount,tax,total)
 values(u,p_workspace,trim(p_invoice_number),p_invoice_date,p_payload,round(sub)::bigint,round(disc)::bigint,round(tax_amount)::bigint,round(grand)::bigint) returning * into saved;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(u,p_workspace,'invoice','invoice_saved');
 insert into public.platform_events(user_id,workspace_id,app_id,name) values(u,p_workspace,'invoice','tool_value_completed');
 return jsonb_build_object('id',saved.id,'invoice_number',saved.invoice_number,'invoice_date',saved.invoice_date,'subtotal',saved.subtotal,'discount',saved.discount,'tax',saved.tax,'total',saved.total,'created_at',saved.created_at);
end;$$;
revoke all on function public.save_invoice(uuid,text,date,jsonb) from public,anon;
grant execute on function public.save_invoice(uuid,text,date,jsonb) to authenticated;
commit;
