create table if not exists public.harness_runs (
  id uuid primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  firm_id text not null,
  harness_version text not null,
  workflow_name text not null default 'workspace.shape-from-ocr',
  status text not null default 'running',
  final_status text null,
  file_count integer not null default 0,
  provider text null,
  model text null,
  input_tokens integer null,
  output_tokens integer null,
  stats jsonb not null default '{}'::jsonb,
  final_bundle jsonb null,
  final_shape jsonb null,
  error jsonb null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_runs_firm_id_check check (length(btrim(firm_id)) > 0),
  constraint harness_runs_harness_version_check check (length(btrim(harness_version)) > 0),
  constraint harness_runs_workflow_name_check check (length(btrim(workflow_name)) > 0),
  constraint harness_runs_status_check check (
    status in ('running', 'ready', 'needs_review', 'failed')
  ),
  constraint harness_runs_final_status_check check (
    final_status is null or final_status in ('ready', 'needs_review', 'failed')
  ),
  constraint harness_runs_file_count_check check (file_count >= 0),
  constraint harness_runs_input_tokens_check check (
    input_tokens is null or input_tokens >= 0
  ),
  constraint harness_runs_output_tokens_check check (
    output_tokens is null or output_tokens >= 0
  )
);

create index if not exists harness_runs_case_started_idx
  on public.harness_runs (case_id, started_at desc, id desc);

create index if not exists harness_runs_firm_status_started_idx
  on public.harness_runs (firm_id, status, started_at desc);

create table if not exists public.harness_run_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  source_key text not null,
  file_name text not null,
  ocr_conversion_id uuid null,
  document_sha256 text null,
  provider text not null,
  provider_model text not null,
  pages_processed integer null,
  source_document_id uuid null references public.case_source_documents(id) on delete set null,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_run_sources_source_key_check check (length(btrim(source_key)) > 0),
  constraint harness_run_sources_file_name_check check (length(btrim(file_name)) > 0),
  constraint harness_run_sources_provider_check check (length(btrim(provider)) > 0),
  constraint harness_run_sources_provider_model_check check (
    length(btrim(provider_model)) > 0
  ),
  constraint harness_run_sources_document_sha256_check check (
    document_sha256 is null or document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint harness_run_sources_pages_processed_check check (
    pages_processed is null or pages_processed >= 0
  ),
  constraint harness_run_sources_ordinal_check check (ordinal >= 0),
  constraint harness_run_sources_run_source_key_unique unique (run_id, source_key)
);

create index if not exists harness_run_sources_case_conversion_idx
  on public.harness_run_sources (case_id, ocr_conversion_id)
  where ocr_conversion_id is not null;

create index if not exists harness_run_sources_run_ordinal_idx
  on public.harness_run_sources (run_id, ordinal asc, id asc);

create table if not exists public.harness_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  source_key text null,
  step_name text not null,
  ordinal integer not null,
  status text not null,
  metrics jsonb not null default '{}'::jsonb,
  error jsonb null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_run_steps_step_name_check check (length(btrim(step_name)) > 0),
  constraint harness_run_steps_ordinal_check check (ordinal >= 0),
  constraint harness_run_steps_status_check check (
    status in ('started', 'succeeded', 'failed')
  )
);

create unique index if not exists harness_run_steps_run_source_step_unique_idx
  on public.harness_run_steps (
    run_id,
    coalesce(source_key, ''),
    step_name
  );

create index if not exists harness_run_steps_run_ordinal_idx
  on public.harness_run_steps (run_id, ordinal asc, id asc);

create table if not exists public.harness_run_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  source_key text null,
  artifact_kind text not null,
  step_name text null,
  ordinal integer not null,
  status text not null,
  artifact jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harness_run_artifacts_kind_check check (
    artifact_kind in (
      'source_map',
      'quality_findings',
      'segments',
      'extracted_findings',
      'bundle',
      'workspace_shape',
      'error'
    )
  ),
  constraint harness_run_artifacts_ordinal_check check (ordinal >= 0),
  constraint harness_run_artifacts_status_check check (
    status in ('succeeded', 'failed')
  )
);

create unique index if not exists harness_run_artifacts_run_source_kind_step_unique_idx
  on public.harness_run_artifacts (
    run_id,
    coalesce(source_key, ''),
    artifact_kind,
    coalesce(step_name, '')
  );

create index if not exists harness_run_artifacts_run_ordinal_idx
  on public.harness_run_artifacts (run_id, ordinal asc, id asc);

create index if not exists harness_run_artifacts_case_kind_created_idx
  on public.harness_run_artifacts (case_id, artifact_kind, created_at desc);
