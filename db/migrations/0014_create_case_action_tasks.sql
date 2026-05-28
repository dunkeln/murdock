create table if not exists public.case_action_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  task_key text not null,
  actor text not null default 'case_team',
  title text not null,
  description text not null,
  kind text not null,
  status text not null default 'queued',
  priority text not null default 'medium',
  source_type text not null,
  source_review_refs text[] not null default '{}'::text[],
  source_span_refs text[] not null default '{}'::text[],
  provenance_refs jsonb not null default '[]'::jsonb,
  connector_hint text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_action_tasks_key_check check (length(btrim(task_key)) > 0),
  constraint case_action_tasks_title_check check (length(btrim(title)) > 0),
  constraint case_action_tasks_description_check check (length(btrim(description)) > 0),
  constraint case_action_tasks_kind_check check (
    kind in (
      'request_information',
      'request_document',
      'notify_client',
      'verify_source',
      'mark_for_case_team_review',
      'prepare_draft',
      'prepare_redline',
      'update_checklist',
      'calendar_deadline',
      'calculate_amount',
      'record_time',
      'file_or_submit',
      'dismiss_review_item'
    )
  ),
  constraint case_action_tasks_actor_check check (
    actor in (
      'client',
      'case_team',
      'court_or_agency',
      'counterparty',
      'third_party',
      'system'
    )
  ),
  constraint case_action_tasks_status_check check (
    status in ('queued', 'in_progress', 'blocked', 'done', 'dismissed')
  ),
  constraint case_action_tasks_priority_check check (
    priority in ('critical', 'high', 'medium', 'low')
  ),
  constraint case_action_tasks_source_type_check check (
    source_type in (
      'reviewer_choice',
      'custom_user_step',
      'dismissal_request',
      'agent_memory'
    )
  ),
  constraint case_action_tasks_provenance_refs_array_check check (
    jsonb_typeof(provenance_refs) = 'array'
  ),
  constraint case_action_tasks_case_key_unique unique (case_id, task_key)
);

create index if not exists case_action_tasks_case_status_priority_idx
  on public.case_action_tasks (
    case_id,
    status,
    priority,
    updated_at desc
  );

create index if not exists case_action_tasks_case_source_type_idx
  on public.case_action_tasks (case_id, source_type, updated_at desc);
