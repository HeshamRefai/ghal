-- G-HAL 0001 — Core Domain Model (Phase 0/1)
create extension if not exists "uuid-ossp";

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  email text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table roles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  name text not null,
  permissions jsonb not null default '[]',
  unique (tenant_id, name)
);

create table user_roles (
  tenant_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  primary key (user_id, role_id)
);

create table actors (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  type text not null check (type in ('human','agent','system')),
  ref text not null,
  name text not null,
  trust_score numeric(5,4) not null default 0.5,
  reputation jsonb not null default '{}',
  unique (tenant_id, type, ref)
);

create table processes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table process_versions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_id uuid not null references processes(id),
  version int not null,
  status text not null default 'draft' check (status in ('draft','proposed','simulated','approved','active','archived')),
  change_reason text,
  change_proposal_id uuid,
  ir jsonb not null,
  created_at timestamptz not null default now(),
  unique (process_id, version)
);

create table process_modules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_version_id uuid not null references process_versions(id),
  name text not null,
  "order" int not null,
  unique (process_version_id, "order")
);

create table process_steps (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  module_id uuid not null references process_modules(id),
  type text not null default 'step' check (type in ('step','decision','approval')),
  name text not null,
  actor_id uuid references actors(id),
  autonomy text not null default 'APPROVAL_REQUIRED' check (autonomy in ('ALLOW','SUPERVISED','APPROVAL_REQUIRED','ESCALATE','BLOCK')),
  parameters jsonb not null default '{}',
  risk_level text not null default 'low' check (risk_level in ('low','med','high')),
  reversibility boolean not null default true,
  evidence_required text[] not null default '{}',
  "order" int not null
);

create table process_transitions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_version_id uuid not null references process_versions(id),
  from_step_id uuid references process_steps(id),
  to_step_id uuid not null references process_steps(id),
  condition_param text
);

create table cases (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_version_id uuid not null references process_versions(id),
  external_ref text,
  status text not null default 'open' check (status in ('open','waiting_human','waiting_approval','completed','exception','cancelled')),
  current_step_id uuid references process_steps(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  outcome jsonb
);

create table events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  step_id uuid references process_steps(id),
  actor_id uuid references actors(id),
  type text not null,
  payload jsonb not null default '{}',
  signature text,
  occurred_at timestamptz not null default now()
);
create index idx_events_case on events (tenant_id, case_id, occurred_at);

create table policies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  name text not null,
  as_code jsonb not null,
  active boolean not null default true,
  version int not null default 1
);

create table parameters (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  key text not null,
  value jsonb not null,
  version int not null default 1,
  unique (tenant_id, key)
);

create table decisions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  case_id uuid references cases(id),
  step_id uuid references process_steps(id),
  actor_id uuid references actors(id),
  what text not null,
  why text,
  model_id text,
  confidence numeric(5,4),
  policy_id uuid references policies(id),
  process_version_id uuid references process_versions(id),
  evidence jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  decision_id uuid references decisions(id),
  change_proposal_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id uuid references users(id),
  decided_at timestamptz
);

create table exceptions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  case_id uuid not null references cases(id),
  step_id uuid references process_steps(id),
  type text not null,
  classification text,
  root_cause text,
  cost_estimate numeric,
  prevention_proposal jsonb,
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  actor_id uuid references actors(id),
  action text not null,
  object_type text not null,
  object_id uuid,
  payload jsonb not null default '{}',
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);

create table change_proposals (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_id uuid not null references processes(id),
  source text not null,
  title text not null,
  proposal jsonb not null,
  impact jsonb,
  simulation_id uuid,
  status text not null default 'proposed' check (status in ('proposed','impact_analyzed','simulated','approved','rejected','rolled_out')),
  created_at timestamptz not null default now()
);

create table process_memories (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references organizations(id),
  process_id uuid not null references processes(id),
  case_id uuid references cases(id),
  kind text not null,
  content text not null,
  source_refs jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);
