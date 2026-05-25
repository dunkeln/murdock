create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slug text not null,
  title text not null,
  type text not null default 'general',
  client_name text null,
  priority text not null default 'normal',
  next_action text null,
  next_deadline_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint cases_slug_not_blank_check check (length(btrim(slug)) > 0),
  constraint cases_title_not_blank_check check (length(btrim(title)) > 0),
  constraint cases_type_check check (type in ('bankruptcy', 'immigration', 'general')),
  constraint cases_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint cases_user_slug_unique unique (user_id, slug)
);

create index if not exists cases_user_updated_id_idx
  on public.cases (user_id, updated_at desc, id desc);

insert into public.cases (
  user_id,
  slug,
  title,
  type,
  client_name,
  priority,
  next_action,
  next_deadline_at
)
values
  (
    'dev-user',
    'acme-v-glade',
    'Acme v. Glade',
    'general',
    'Acme Holdings',
    'high',
    'Review draft settlement memo',
    now() + interval '2 days'
  ),
  (
    'dev-user',
    'rivera-intake',
    'Rivera intake',
    'immigration',
    'Maria Rivera',
    'normal',
    'Collect signed engagement letter',
    now() + interval '5 days'
  ),
  (
    'dev-user',
    'northstar-review',
    'Northstar review',
    'general',
    'Northstar LLC',
    'normal',
    'Summarize uploaded correspondence',
    null
  ),
  (
    'dev-user',
    'atlas-filing',
    'Atlas filing',
    'bankruptcy',
    'Atlas Partners',
    'urgent',
    'Prepare filing checklist',
    now() + interval '1 day'
  )
on conflict (user_id, slug) do update
set
  title = excluded.title,
  type = excluded.type,
  client_name = excluded.client_name,
  priority = excluded.priority,
  next_action = excluded.next_action,
  next_deadline_at = excluded.next_deadline_at,
  updated_at = now();
