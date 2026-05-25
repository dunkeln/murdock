create table if not exists public.harness_source_claims (
  case_id uuid not null references public.cases(id) on delete cascade,
  source_key text not null,
  run_id uuid not null,
  status text not null default 'running',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, source_key),
  constraint harness_source_claims_source_key_check check (
    length(btrim(source_key)) > 0
  ),
  constraint harness_source_claims_status_check check (
    status in ('running', 'ready', 'needs_review', 'failed')
  )
);

create index if not exists harness_source_claims_run_idx
  on public.harness_source_claims (run_id);

create index if not exists harness_source_claims_running_expiry_idx
  on public.harness_source_claims (expires_at)
  where status = 'running';
