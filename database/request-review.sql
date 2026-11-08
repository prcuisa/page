-- Read-only operator report. Run only with authorized operator database access.
-- No request content is exposed in the public Hub catalog.
select coalesce(g.title, 'Belum dikelompokkan') as problem_group,
 count(*) as requests, count(distinct r.user_id) as people,
 count(distinct r.workspace_id) as businesses,
 min(r.created_at) as first_request, max(r.created_at) as latest_request
from public.tool_requests r left join public.request_groups g on g.id=r.group_id
group by g.id,g.title order by people desc,latest_request desc;

select id,problem,workflow,frequency,status,group_id,created_at
from public.tool_requests order by created_at desc limit 100;
-- Review/group mutations are intentionally operator-only, not callable by normal clients.
