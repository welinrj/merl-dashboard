-- Private supporting files for the authenticated indicator results workspace.
-- No public/anonymous access and no change to existing document buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merl-indicator-evidence', 'merl-indicator-evidence', false, 26214400,
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv','application/geo+json','application/json','application/zip','application/x-zip-compressed'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function merl.can_access_indicator_evidence(p_name text, p_write boolean default false)
returns boolean language plpgsql stable security definer
set search_path = merl, public, pg_temp
as $$
declare v_project text := split_part(p_name, '/', 1);
begin
  if auth.role() = 'service_role' then return true; end if;
  if (merl.current_db_user()).id is null then return false; end if;
  if p_write and not merl.is_editor() then return false; end if;
  if v_project !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return merl.can_access_project(v_project::uuid);
end;
$$;
revoke all on function merl.can_access_indicator_evidence(text, boolean) from public, anon;
grant execute on function merl.can_access_indicator_evidence(text, boolean) to authenticated, service_role;

drop policy if exists merl_indicator_evidence_read on storage.objects;
create policy merl_indicator_evidence_read on storage.objects for select to authenticated
using (bucket_id = 'merl-indicator-evidence' and merl.can_access_indicator_evidence(name, false));
drop policy if exists merl_indicator_evidence_insert on storage.objects;
create policy merl_indicator_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id = 'merl-indicator-evidence' and merl.can_access_indicator_evidence(name, true));
drop policy if exists merl_indicator_evidence_delete on storage.objects;
create policy merl_indicator_evidence_delete on storage.objects for delete to authenticated
using (bucket_id = 'merl-indicator-evidence' and merl.can_access_indicator_evidence(name, true));
