begin;
create table public.qr_designs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),
 design jsonb not null check(jsonb_typeof(design)='object' and jsonb_typeof(design->'fields')='object' and jsonb_typeof(design->'style')='object' and octet_length(design::text)<=450000),
 created_at timestamptz not null default now()
);
create index qr_designs_user_workspace_time on public.qr_designs(user_id,workspace_id,created_at desc);
alter table public.qr_designs enable row level security;
create policy qr_designs_read on public.qr_designs for select to authenticated using(user_id=(select auth.uid()) and workspace_id in(select id from public.workspaces));
revoke all on public.qr_designs from public,anon,authenticated;
grant select on public.qr_designs to authenticated;
-- Atomic entitlement/rate/quota validation and save; identity is never caller-supplied.
create function public.save_qr_design(p_workspace uuid,p_name text,p_design jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.qr_designs;
begin
 if p_design is null or p_design->>'type' is null or p_design->>'type' not in('url','text','email','phone','sms','whatsapp','wifi','vcard','location','event') then raise exception 'INVALID_DESIGN';end if;
 perform public.platform_action(p_workspace,'qr','qr');
 insert into public.qr_designs(user_id,workspace_id,name,design) values(auth.uid(),p_workspace,trim(p_name),p_design) returning * into result;
 return jsonb_build_object('id',result.id,'name',result.name,'design',result.design,'created_at',result.created_at);
end;$$;
revoke all on function public.save_qr_design(uuid,text,jsonb) from public,anon;
grant execute on function public.save_qr_design(uuid,text,jsonb) to authenticated;
update public.apps set description='Buat QR custom untuk tautan, WiFi, kontak, dan kebutuhan bisnis.',keywords='buat qr kode menu katalog link tautan whatsapp wifi kontak vcard email telepon sms lokasi event logo warna',updated_at=now() where slug='qr';
commit;
