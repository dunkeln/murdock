create table if not exists public.case_review_reducer_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  harness_run_id uuid not null references public.harness_runs(id) on delete cascade,
  reducer_version text not null,
  status text not null default 'running',
  provider text null,
  model text null,
  input_tokens integer null,
  output_tokens integer null,
  stats jsonb not null default '{}'::jsonb,
  error jsonb null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_review_reducer_runs_version_check check (length(btrim(reducer_version)) > 0),
  constraint case_review_reducer_runs_status_check check (
    status in ('running', 'succeeded', 'fallback', 'failed')
  ),
  constraint case_review_reducer_runs_input_tokens_check check (
    input_tokens is null or input_tokens >= 0
  ),
  constraint case_review_reducer_runs_output_tokens_check check (
    output_tokens is null or output_tokens >= 0
  ),
  constraint case_review_reducer_runs_harness_version_unique unique (
    harness_run_id,
    reducer_version
  )
);

create index if not exists case_review_reducer_runs_case_completed_idx
  on public.case_review_reducer_runs (
    case_id,
    completed_at desc nulls last,
    updated_at desc,
    id desc
  );

create table if not exists public.case_review_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  reducer_run_id uuid not null references public.case_review_reducer_runs(id) on delete cascade,
  action_key text not null,
  kind text not null,
  priority text not null,
  required_capability text not null default 'operational_followup',
  blocking boolean not null default false,
  status text not null default 'open',
  title text not null,
  summary text not null,
  action_label text not null,
  source_span_ids uuid[] not null default '{}',
  raw_refs jsonb not null default '[]'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_review_actions_action_key_check check (length(btrim(action_key)) > 0),
  constraint case_review_actions_title_check check (length(btrim(title)) > 0),
  constraint case_review_actions_summary_check check (length(btrim(summary)) > 0),
  constraint case_review_actions_action_label_check check (length(btrim(action_label)) > 0),
  constraint case_review_actions_kind_check check (
    kind in ('conflict', 'revision', 'timeline', 'missing', 'source_check')
  ),
  constraint case_review_actions_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  ),
  constraint case_review_actions_required_capability_check check (
    required_capability in (
      'factual_completion',
      'source_verification',
      'legal_judgment',
      'filing_preparation',
      'document_version_review',
      'timeline_management',
      'operational_followup'
    )
  ),
  constraint case_review_actions_status_check check (
    status in ('open', 'resolved', 'dismissed')
  ),
  constraint case_review_actions_raw_refs_array_check check (jsonb_typeof(raw_refs) = 'array'),
  constraint case_review_actions_case_action_key_unique unique (case_id, action_key)
);

create index if not exists case_review_actions_run_status_idx
  on public.case_review_actions (reducer_run_id, status, priority, updated_at desc);

create index if not exists case_review_actions_case_status_idx
  on public.case_review_actions (case_id, status, priority, updated_at desc);

create index if not exists case_review_actions_case_capability_status_idx
  on public.case_review_actions (
    case_id,
    required_capability,
    status,
    priority,
    updated_at desc
  );

create table if not exists public.case_review_action_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  action_id uuid not null references public.case_review_actions(id) on delete cascade,
  event_type text not null,
  actor_id text null,
  note text null,
  created_at timestamptz not null default now(),
  constraint case_review_action_events_type_check check (
    event_type in ('comment', 'resolved', 'dismissed', 'reopened')
  ),
  constraint case_review_action_events_actor_id_check check (
    actor_id is null or length(btrim(actor_id)) > 0
  ),
  constraint case_review_action_events_note_check check (
    note is null or length(btrim(note)) > 0
  )
);

create index if not exists case_review_action_events_action_created_idx
  on public.case_review_action_events (action_id, created_at desc, id desc);

alter table public.harness_run_artifacts
  drop constraint if exists harness_run_artifacts_kind_check;

alter table public.harness_run_artifacts
  add constraint harness_run_artifacts_kind_check check (
    artifact_kind in (
      'source_map',
      'quality_findings',
      'segments',
      'v2_document_annotation',
      'extracted_findings',
      'bundle',
      'workspace_shape',
      'v2_review_reducer',
      'error'
    )
  );
