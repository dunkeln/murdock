create table if not exists public.case_chat_threads (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_chat_threads_user_id_check check (length(btrim(user_id)) > 0),
  constraint case_chat_threads_status_check check (status in ('active', 'archived')),
  constraint case_chat_threads_case_user_unique unique (case_id, user_id)
);

create index if not exists case_chat_threads_case_user_status_idx
  on public.case_chat_threads (case_id, user_id, status, updated_at desc);

create table if not exists public.case_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.case_chat_threads(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id text not null,
  role text not null,
  status text not null default 'completed',
  content text not null default '',
  context_trace jsonb not null default '[]'::jsonb,
  provider text null,
  model text null,
  input_tokens integer null,
  output_tokens integer null,
  error jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_chat_messages_user_id_check check (length(btrim(user_id)) > 0),
  constraint case_chat_messages_role_check check (role in ('user', 'assistant')),
  constraint case_chat_messages_status_check check (
    status in ('pending', 'streaming', 'completed', 'failed')
  ),
  constraint case_chat_messages_context_trace_array_check check (
    jsonb_typeof(context_trace) = 'array'
  ),
  constraint case_chat_messages_input_tokens_check check (
    input_tokens is null or input_tokens >= 0
  ),
  constraint case_chat_messages_output_tokens_check check (
    output_tokens is null or output_tokens >= 0
  )
);

create index if not exists case_chat_messages_thread_created_idx
  on public.case_chat_messages (thread_id, created_at asc, id asc);

create index if not exists case_chat_messages_case_user_created_idx
  on public.case_chat_messages (case_id, user_id, created_at asc, id asc);

create table if not exists public.case_chat_summaries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.case_chat_threads(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id text not null,
  covered_through_message_id uuid not null references public.case_chat_messages(id) on delete cascade,
  summary text not null,
  token_estimate integer not null default 0,
  provider text null,
  model text null,
  input_tokens integer null,
  output_tokens integer null,
  created_at timestamptz not null default now(),
  constraint case_chat_summaries_user_id_check check (length(btrim(user_id)) > 0),
  constraint case_chat_summaries_summary_check check (length(btrim(summary)) > 0),
  constraint case_chat_summaries_token_estimate_check check (token_estimate >= 0),
  constraint case_chat_summaries_input_tokens_check check (
    input_tokens is null or input_tokens >= 0
  ),
  constraint case_chat_summaries_output_tokens_check check (
    output_tokens is null or output_tokens >= 0
  )
);

create index if not exists case_chat_summaries_thread_created_idx
  on public.case_chat_summaries (thread_id, created_at desc, id desc);
