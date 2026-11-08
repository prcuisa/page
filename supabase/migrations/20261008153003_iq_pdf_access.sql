begin;
create function public.iq_pdf_document(w uuid,doc uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;begin
 perform public.iq_access(w,'invoice_quotation.pdf_export');
 perform pg_advisory_xact_lock(hashtext('iq-pdf:'||auth.uid()::text));
 if (select count(*) from public.iq_document_events where actor_id=auth.uid() and event='iq_pdf_requested' and created_at>now()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT';end if;
 d:=public.iq_read(w,doc=>doc);
 if d->>'lifecycle_status'='draft' then raise exception 'ISSUE_FIRST';end if;
 insert into public.iq_document_events(workspace_id,document_id,actor_id,event) values(w,doc,auth.uid(),'iq_pdf_requested');
 return d;
end;$$;
revoke all on function public.iq_pdf_document(uuid,uuid) from public,anon;
grant execute on function public.iq_pdf_document(uuid,uuid) to authenticated;
commit;
create function public.iq_pdf_record(w uuid,doc uuid) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;begin
 a:=public.iq_access(w,'invoice_quotation.pdf_export');
 perform pg_advisory_xact_lock(hashtext('iq-pdf:'||auth.uid()::text));
 if (select count(*) from public.usage_events where user_id=auth.uid() and app_id='invoice-quotation' and metric='pdf_generated' and created_at>=date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta') >= coalesce((a->>'feature_limit')::integer,2147483647) then raise exception 'USAGE_LIMIT';end if;
 if not exists(select 1 from public.iq_documents where workspace_id=w and id=doc and lifecycle_status<>'draft') then raise exception 'NOT_FOUND' using errcode='42501';end if;
 insert into public.usage_events(user_id,workspace_id,app_id,metric) values(auth.uid(),w,'invoice-quotation','pdf_generated');
 insert into public.iq_document_events(workspace_id,document_id,actor_id,event) values(w,doc,auth.uid(),'iq_pdf_generated');
end;$$;
revoke all on function public.iq_pdf_record(uuid,uuid) from public,anon;
grant execute on function public.iq_pdf_record(uuid,uuid) to authenticated;
