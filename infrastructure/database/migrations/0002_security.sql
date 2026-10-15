-- G-HAL 0002 — Security, RLS, Audit immutability (Phase 0)
create extension if not exists pgcrypto;

alter table audit_events add column if not exists seq bigserial;

create or replace function audit_chain() returns trigger as $$
declare
  prev text;
begin
  select hash into prev from audit_events
   where tenant_id = new.tenant_id order by seq desc limit 1;
  new.prev_hash := coalesce(prev, 'GENESIS');
  new.hash := encode(digest(new.prev_hash || new.actor_id::text || new.action || new.object_type || new.object_id::text || new.payload::text || new.created_at::text, 'sha256'), 'hex');
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_audit_chain on audit_events;
create trigger trg_audit_chain before insert on audit_events for each row execute function audit_chain();

revoke update, delete on audit_events from authenticated;
revoke update, delete on audit_events from anon;

create or replace function current_tenant() returns uuid as $$
  select nullif(current_setting('app.tenant', true), '')::uuid
$$ language sql stable;

do $$
declare t text;
begin
  foreach t in array array[
    'users','user_roles','actors','processes','process_versions','process_modules',
    'process_steps','process_transitions','cases','events','policies','parameters',
    'decisions','approvals','exceptions','audit_events','change_proposals','process_memories'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = current_tenant()) with check (tenant_id = current_tenant())', t);
  end loop;
end $$;
