create table if not exists public.matter_operations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  source_run_id uuid null,
  operation_key text not null,
  source_hash text null,
  previous_source_hash text null,
  required_capability text not null default 'operational_followup',
  priority text not null default 'medium',
  blocking boolean not null default false,
  state text not null default 'open',
  current boolean not null default true,
  superseded_by_operation_id uuid null references public.matter_operations(id) on delete set null,
  title text not null,
  summary text not null,
  provenance_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matter_operations_source_type_check check (
    source_type in (
      'review_action',
      'revision_claim',
      'procedural_requirement',
      'matter_fact'
    )
  ),
  constraint matter_operations_operation_key_check check (length(btrim(operation_key)) > 0),
  constraint matter_operations_source_hash_check check (
    source_hash is null or source_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint matter_operations_previous_source_hash_check check (
    previous_source_hash is null or previous_source_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint matter_operations_required_capability_check check (
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
  constraint matter_operations_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  ),
  constraint matter_operations_state_check check (
    state in (
      'open',
      'in_review',
      'resolved',
      'dismissed',
      'ignored',
      'untracked',
      'superseded'
    )
  ),
  constraint matter_operations_title_check check (length(btrim(title)) > 0),
  constraint matter_operations_summary_check check (length(btrim(summary)) > 0),
  constraint matter_operations_provenance_refs_array_check check (
    jsonb_typeof(provenance_refs) = 'array'
  ),
  constraint matter_operations_case_source_unique unique (
    case_id,
    source_type,
    source_id
  ),
  constraint matter_operations_case_key_unique unique (case_id, operation_key)
);

create index if not exists matter_operations_case_current_state_idx
  on public.matter_operations (
    case_id,
    current,
    state,
    priority,
    updated_at desc
  );

create index if not exists matter_operations_case_capability_state_idx
  on public.matter_operations (
    case_id,
    required_capability,
    state,
    priority,
    updated_at desc
  );

create index if not exists matter_operations_source_idx
  on public.matter_operations (source_type, source_id);

create table if not exists public.matter_operation_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  operation_id uuid not null references public.matter_operations(id) on delete cascade,
  event_type text not null,
  event_key text null,
  actor_id text null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint matter_operation_events_type_check check (
    event_type in (
      'opened',
      'resolved',
      'dismissed',
      'ignored',
      'marked_untracked',
      'superseded',
      'reopened',
      'commented'
    )
  ),
  constraint matter_operation_events_event_key_check check (
    event_key is null or length(btrim(event_key)) > 0
  ),
  constraint matter_operation_events_actor_id_check check (
    actor_id is null or length(btrim(actor_id)) > 0
  ),
  constraint matter_operation_events_note_check check (
    note is null or length(btrim(note)) > 0
  ),
  constraint matter_operation_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists matter_operation_events_operation_event_key_idx
  on public.matter_operation_events (operation_id, event_key)
  where event_key is not null;

create index if not exists matter_operation_events_case_created_idx
  on public.matter_operation_events (case_id, created_at desc, id desc);

create index if not exists matter_operation_events_operation_created_idx
  on public.matter_operation_events (operation_id, created_at desc, id desc);
