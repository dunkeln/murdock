create table if not exists public.case_source_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  source_key text not null,
  title text not null,
  file_name text not null,
  source_kind text not null default 'other',
  case_document_id uuid null,
  ocr_conversion_id uuid null,
  document_sha256 text null,
  ocr_status text null,
  source_date timestamptz null,
  received_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_source_documents_source_key_check check (length(btrim(source_key)) > 0),
  constraint case_source_documents_title_check check (length(btrim(title)) > 0),
  constraint case_source_documents_file_name_check check (length(btrim(file_name)) > 0),
  constraint case_source_documents_source_kind_check check (
    source_kind in (
      'intake',
      'pleading',
      'motion',
      'order',
      'correspondence',
      'evidence',
      'agency',
      'work_product',
      'other'
    )
  ),
  constraint case_source_documents_document_sha256_check check (
    document_sha256 is null or document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint case_source_documents_ocr_status_check check (
    ocr_status is null or ocr_status in ('pending', 'processing', 'ready', 'failed')
  ),
  constraint case_source_documents_case_source_key_unique unique (case_id, source_key)
);

create index if not exists case_source_documents_case_created_idx
  on public.case_source_documents (case_id, created_at desc, id desc);

create table if not exists public.case_source_spans (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  source_document_id uuid not null references public.case_source_documents(id) on delete cascade,
  span_key text not null,
  page_index integer null,
  page_label text null,
  field_path text null,
  verbatim_excerpt text not null,
  confidence numeric(4, 3) null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_source_spans_span_key_check check (length(btrim(span_key)) > 0),
  constraint case_source_spans_verbatim_excerpt_check check (length(btrim(verbatim_excerpt)) > 0),
  constraint case_source_spans_page_index_check check (
    page_index is null or page_index >= 0
  ),
  constraint case_source_spans_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint case_source_spans_case_span_key_unique unique (case_id, span_key)
);

create index if not exists case_source_spans_case_document_idx
  on public.case_source_spans (case_id, source_document_id);

create table if not exists public.case_operational_facts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  fact_key text not null,
  label text not null,
  category text not null,
  category_detail text null,
  value_type text not null default 'text',
  stated_value text null,
  normalized_value text null,
  calculated_value text null,
  effective_at timestamptz null,
  observed_at timestamptz null,
  is_current boolean not null default true,
  confidence numeric(4, 3) null,
  source_span_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_operational_facts_fact_key_check check (length(btrim(fact_key)) > 0),
  constraint case_operational_facts_label_check check (length(btrim(label)) > 0),
  constraint case_operational_facts_category_check check (length(btrim(category)) > 0),
  constraint case_operational_facts_value_type_check check (
    value_type in (
      'text',
      'number',
      'money',
      'date',
      'datetime',
      'boolean',
      'list',
      'object',
      'unknown'
    )
  ),
  constraint case_operational_facts_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint case_operational_facts_case_fact_key_unique unique (case_id, fact_key)
);

create index if not exists case_operational_facts_case_category_idx
  on public.case_operational_facts (case_id, category, updated_at desc);

create table if not exists public.case_chronology_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  event_key text not null,
  event_kind text not null default 'other',
  title text not null,
  description text null,
  occurred_at timestamptz null,
  occurred_at_precision text not null default 'unknown',
  confidence numeric(4, 3) null,
  source_span_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_chronology_events_event_key_check check (length(btrim(event_key)) > 0),
  constraint case_chronology_events_title_check check (length(btrim(title)) > 0),
  constraint case_chronology_events_event_kind_check check (
    event_kind in (
      'intake',
      'document_received',
      'deadline',
      'filing',
      'court_order',
      'client_update',
      'document_revision',
      'status_change',
      'other'
    )
  ),
  constraint case_chronology_events_precision_check check (
    occurred_at_precision in ('exact', 'day', 'month', 'unknown')
  ),
  constraint case_chronology_events_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint case_chronology_events_case_event_key_unique unique (case_id, event_key)
);

create index if not exists case_chronology_events_case_occurred_idx
  on public.case_chronology_events (case_id, occurred_at asc nulls last, id asc);

create table if not exists public.case_operational_issues (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  issue_key text not null,
  issue_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  description text null,
  provenance_summary text null,
  related_fact_ids uuid[] not null default '{}',
  related_event_ids uuid[] not null default '{}',
  source_span_ids uuid[] not null default '{}',
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_operational_issues_issue_key_check check (length(btrim(issue_key)) > 0),
  constraint case_operational_issues_title_check check (length(btrim(title)) > 0),
  constraint case_operational_issues_issue_type_check check (
    issue_type in (
      'revision_drift',
      'contradiction',
      'chronology_gap',
      'missing_context'
    )
  ),
  constraint case_operational_issues_severity_check check (
    severity in ('low', 'medium', 'high')
  ),
  constraint case_operational_issues_status_check check (
    status in ('open', 'reviewed', 'dismissed')
  ),
  constraint case_operational_issues_case_issue_key_unique unique (case_id, issue_key)
);

create index if not exists case_operational_issues_case_type_idx
  on public.case_operational_issues (case_id, issue_type, severity, detected_at desc);

with target_case as (
  select id
  from public.cases
  where user_id = 'dev-user'
    and slug = 'acme-v-glade'
  limit 1
)
insert into public.case_source_documents (
  case_id,
  source_key,
  title,
  file_name,
  source_kind,
  ocr_status,
  source_date,
  received_at
)
select
  target_case.id,
  source_key,
  title,
  file_name,
  source_kind,
  'ready',
  source_date::timestamptz,
  received_at::timestamptz
from target_case
cross join (
  values
    (
      'uscis-notice-2026-01-12',
      'USCIS notice of action',
      'uscis-notice-of-action.pdf',
      'agency',
      '2026-01-12T17:00:00Z',
      '2026-01-12T18:10:00Z'
    ),
    (
      'client-intake-2026-01-15',
      'Client intake summary',
      'client-intake-summary.pdf',
      'intake',
      '2026-01-15T20:00:00Z',
      '2026-01-15T20:25:00Z'
    ),
    (
      'case-summary-v1-2026-01-20',
      'Case summary draft v1',
      'case-summary-v1.docx',
      'work_product',
      '2026-01-20T19:00:00Z',
      '2026-01-20T19:05:00Z'
    ),
    (
      'case-summary-v2-2026-02-01',
      'Case summary draft v2',
      'case-summary-v2.docx',
      'work_product',
      '2026-02-01T19:00:00Z',
      '2026-02-01T19:12:00Z'
    )
) as seed(source_key, title, file_name, source_kind, source_date, received_at)
on conflict (case_id, source_key) do update
set
  title = excluded.title,
  file_name = excluded.file_name,
  source_kind = excluded.source_kind,
  ocr_status = excluded.ocr_status,
  source_date = excluded.source_date,
  received_at = excluded.received_at,
  updated_at = now();

with target_case as (
  select id
  from public.cases
  where user_id = 'dev-user'
    and slug = 'acme-v-glade'
  limit 1
),
source_documents as (
  select id, source_key
  from public.case_source_documents
  where case_id = (select id from target_case)
)
insert into public.case_source_spans (
  case_id,
  source_document_id,
  span_key,
  page_index,
  page_label,
  field_path,
  verbatim_excerpt,
  confidence,
  captured_at
)
select
  target_case.id,
  source_documents.id,
  seed.span_key,
  seed.page_index,
  seed.page_label,
  seed.field_path,
  seed.verbatim_excerpt,
  seed.confidence,
  seed.captured_at::timestamptz
from target_case
join source_documents on true
join (
  values
    (
      'uscis-notice-2026-01-12',
      'span-uscis-deadline',
      0,
      '1',
      'notice.response_due',
      'Response must be received by March 14, 2026. Late responses may be rejected.',
      0.990,
      '2026-01-12T18:12:00Z'
    ),
    (
      'client-intake-2026-01-15',
      'span-intake-last-entry',
      1,
      '2',
      'intake.travel_history.last_entry',
      'Client reports last entry to the United States on May 3, 2024 through SFO.',
      0.940,
      '2026-01-15T20:30:00Z'
    ),
    (
      'case-summary-v1-2026-01-20',
      'span-draft-v1-deadline',
      2,
      '3',
      'draft.deadlines.response_due',
      'Response deadline: March 10, 2026. Assign review before filing packet.',
      0.830,
      '2026-01-20T19:10:00Z'
    ),
    (
      'case-summary-v2-2026-02-01',
      'span-draft-v2-revision-note',
      0,
      '1',
      'revision_notes.deadlines',
      'Response deadline updated to March 14, 2026; prior memo language still lists March 10 in the task section.',
      0.910,
      '2026-02-01T19:18:00Z'
    ),
    (
      'client-intake-2026-01-15',
      'span-intake-engagement-gap',
      3,
      '4',
      'intake.open_items.engagement',
      'Engagement letter requested; signed copy not present in intake packet.',
      0.880,
      '2026-01-15T20:31:00Z'
    )
) as seed(
  source_key,
  span_key,
  page_index,
  page_label,
  field_path,
  verbatim_excerpt,
  confidence,
  captured_at
) on source_documents.source_key = seed.source_key
on conflict (case_id, span_key) do update
set
  source_document_id = excluded.source_document_id,
  page_index = excluded.page_index,
  page_label = excluded.page_label,
  field_path = excluded.field_path,
  verbatim_excerpt = excluded.verbatim_excerpt,
  confidence = excluded.confidence,
  captured_at = excluded.captured_at,
  updated_at = now();

with target_case as (
  select id
  from public.cases
  where user_id = 'dev-user'
    and slug = 'acme-v-glade'
  limit 1
),
spans as (
  select id, span_key
  from public.case_source_spans
  where case_id = (select id from target_case)
)
insert into public.case_operational_facts (
  case_id,
  fact_key,
  label,
  category,
  category_detail,
  value_type,
  stated_value,
  normalized_value,
  calculated_value,
  effective_at,
  observed_at,
  is_current,
  confidence,
  source_span_ids
)
select
  target_case.id,
  seed.fact_key,
  seed.label,
  seed.category,
  seed.category_detail,
  seed.value_type,
  seed.stated_value,
  seed.normalized_value,
  seed.calculated_value,
  seed.effective_at::timestamptz,
  seed.observed_at::timestamptz,
  seed.is_current,
  seed.confidence,
  seed.source_span_ids
from target_case
cross join (
  values
    (
      'response-deadline-uscis',
      'Response deadline',
      'deadline',
      'USCIS notice',
      'date',
      'March 14, 2026',
      '2026-03-14',
      null,
      '2026-03-14T23:59:59Z',
      '2026-01-12T18:12:00Z',
      true,
      0.990,
      array[(select id from spans where span_key = 'span-uscis-deadline')]::uuid[]
    ),
    (
      'response-deadline-draft-v1',
      'Response deadline in draft v1',
      'deadline',
      'Case summary draft',
      'date',
      'March 10, 2026',
      '2026-03-10',
      null,
      '2026-03-10T23:59:59Z',
      '2026-01-20T19:10:00Z',
      false,
      0.830,
      array[(select id from spans where span_key = 'span-draft-v1-deadline')]::uuid[]
    ),
    (
      'client-last-entry',
      'Client last entry',
      'client_history',
      'Travel history',
      'date',
      'May 3, 2024 through SFO',
      '2024-05-03',
      null,
      '2024-05-03T12:00:00Z',
      '2026-01-15T20:30:00Z',
      true,
      0.940,
      array[(select id from spans where span_key = 'span-intake-last-entry')]::uuid[]
    ),
    (
      'engagement-letter-status',
      'Engagement letter status',
      'readiness',
      'Open intake item',
      'text',
      'Signed copy not present',
      'missing',
      null,
      null,
      '2026-01-15T20:31:00Z',
      true,
      0.880,
      array[(select id from spans where span_key = 'span-intake-engagement-gap')]::uuid[]
    )
) as seed(
  fact_key,
  label,
  category,
  category_detail,
  value_type,
  stated_value,
  normalized_value,
  calculated_value,
  effective_at,
  observed_at,
  is_current,
  confidence,
  source_span_ids
)
on conflict (case_id, fact_key) do update
set
  label = excluded.label,
  category = excluded.category,
  category_detail = excluded.category_detail,
  value_type = excluded.value_type,
  stated_value = excluded.stated_value,
  normalized_value = excluded.normalized_value,
  calculated_value = excluded.calculated_value,
  effective_at = excluded.effective_at,
  observed_at = excluded.observed_at,
  is_current = excluded.is_current,
  confidence = excluded.confidence,
  source_span_ids = excluded.source_span_ids,
  updated_at = now();

with target_case as (
  select id
  from public.cases
  where user_id = 'dev-user'
    and slug = 'acme-v-glade'
  limit 1
),
spans as (
  select id, span_key
  from public.case_source_spans
  where case_id = (select id from target_case)
)
insert into public.case_chronology_events (
  case_id,
  event_key,
  event_kind,
  title,
  description,
  occurred_at,
  occurred_at_precision,
  confidence,
  source_span_ids
)
select
  target_case.id,
  seed.event_key,
  seed.event_kind,
  seed.title,
  seed.description,
  seed.occurred_at::timestamptz,
  seed.occurred_at_precision,
  seed.confidence,
  seed.source_span_ids
from target_case
cross join (
  values
    (
      'notice-received',
      'document_received',
      'USCIS notice received',
      'Agency notice starts the response clock.',
      '2026-01-12T18:10:00Z',
      'exact',
      0.990,
      array[(select id from spans where span_key = 'span-uscis-deadline')]::uuid[]
    ),
    (
      'client-intake-completed',
      'intake',
      'Client intake completed',
      'Intake captured travel history and open engagement letter item.',
      '2026-01-15T20:25:00Z',
      'exact',
      0.940,
      array[
        (select id from spans where span_key = 'span-intake-last-entry'),
        (select id from spans where span_key = 'span-intake-engagement-gap')
      ]::uuid[]
    ),
    (
      'case-summary-v1-created',
      'document_revision',
      'Case summary v1 created',
      'Draft introduced a March 10 response deadline.',
      '2026-01-20T19:05:00Z',
      'exact',
      0.830,
      array[(select id from spans where span_key = 'span-draft-v1-deadline')]::uuid[]
    ),
    (
      'case-summary-v2-created',
      'document_revision',
      'Case summary v2 created',
      'Revision note corrected the response deadline while flagging stale task language.',
      '2026-02-01T19:12:00Z',
      'exact',
      0.910,
      array[(select id from spans where span_key = 'span-draft-v2-revision-note')]::uuid[]
    ),
    (
      'response-due',
      'deadline',
      'Response due',
      'Operative deadline from the USCIS notice.',
      '2026-03-14T23:59:59Z',
      'day',
      0.990,
      array[(select id from spans where span_key = 'span-uscis-deadline')]::uuid[]
    )
) as seed(
  event_key,
  event_kind,
  title,
  description,
  occurred_at,
  occurred_at_precision,
  confidence,
  source_span_ids
)
on conflict (case_id, event_key) do update
set
  event_kind = excluded.event_kind,
  title = excluded.title,
  description = excluded.description,
  occurred_at = excluded.occurred_at,
  occurred_at_precision = excluded.occurred_at_precision,
  confidence = excluded.confidence,
  source_span_ids = excluded.source_span_ids,
  updated_at = now();

with target_case as (
  select id
  from public.cases
  where user_id = 'dev-user'
    and slug = 'acme-v-glade'
  limit 1
),
spans as (
  select id, span_key
  from public.case_source_spans
  where case_id = (select id from target_case)
),
facts as (
  select id, fact_key
  from public.case_operational_facts
  where case_id = (select id from target_case)
),
events as (
  select id, event_key
  from public.case_chronology_events
  where case_id = (select id from target_case)
)
insert into public.case_operational_issues (
  case_id,
  issue_key,
  issue_type,
  severity,
  status,
  title,
  description,
  provenance_summary,
  related_fact_ids,
  related_event_ids,
  source_span_ids,
  detected_at
)
select
  target_case.id,
  seed.issue_key,
  seed.issue_type,
  seed.severity,
  'open',
  seed.title,
  seed.description,
  seed.provenance_summary,
  seed.related_fact_ids,
  seed.related_event_ids,
  seed.source_span_ids,
  seed.detected_at::timestamptz
from target_case
cross join (
  values
    (
      'issue-response-deadline-contradiction',
      'contradiction',
      'high',
      'Response deadline conflicts across sources',
      'The agency notice states March 14, 2026, while draft v1 states March 10, 2026.',
      'Compare the USCIS notice page 1 with case summary v1 page 3 before relying on draft task dates.',
      array[
        (select id from facts where fact_key = 'response-deadline-uscis'),
        (select id from facts where fact_key = 'response-deadline-draft-v1')
      ]::uuid[],
      array[
        (select id from events where event_key = 'notice-received'),
        (select id from events where event_key = 'case-summary-v1-created')
      ]::uuid[],
      array[
        (select id from spans where span_key = 'span-uscis-deadline'),
        (select id from spans where span_key = 'span-draft-v1-deadline')
      ]::uuid[],
      '2026-02-01T19:20:00Z'
    ),
    (
      'issue-summary-revision-drift',
      'revision_drift',
      'medium',
      'Draft revision corrected deadline but stale task language remains',
      'Case summary v2 notes the March 14 correction, but also says the prior task section still lists March 10.',
      'Use draft v2 revision notes as the operational correction and inspect task language before filing.',
      array[
        (select id from facts where fact_key = 'response-deadline-uscis'),
        (select id from facts where fact_key = 'response-deadline-draft-v1')
      ]::uuid[],
      array[(select id from events where event_key = 'case-summary-v2-created')]::uuid[],
      array[(select id from spans where span_key = 'span-draft-v2-revision-note')]::uuid[],
      '2026-02-01T19:21:00Z'
    ),
    (
      'issue-notice-to-intake-gap',
      'chronology_gap',
      'low',
      'Notice receipt precedes intake context by three days',
      'The response clock begins on January 12, but intake context starts on January 15.',
      'Timeline is preserved, but the workspace should not infer what happened between these dates without source material.',
      array[]::uuid[],
      array[
        (select id from events where event_key = 'notice-received'),
        (select id from events where event_key = 'client-intake-completed')
      ]::uuid[],
      array[
        (select id from spans where span_key = 'span-uscis-deadline'),
        (select id from spans where span_key = 'span-intake-last-entry')
      ]::uuid[],
      '2026-02-01T19:22:00Z'
    ),
    (
      'issue-engagement-letter-missing',
      'missing_context',
      'medium',
      'Signed engagement letter not present',
      'Intake lists the signed engagement letter as requested, but no signed copy is present in the packet.',
      'Treat this as an operational readiness gap rather than a legal conclusion.',
      array[(select id from facts where fact_key = 'engagement-letter-status')]::uuid[],
      array[(select id from events where event_key = 'client-intake-completed')]::uuid[],
      array[(select id from spans where span_key = 'span-intake-engagement-gap')]::uuid[],
      '2026-02-01T19:23:00Z'
    )
) as seed(
  issue_key,
  issue_type,
  severity,
  title,
  description,
  provenance_summary,
  related_fact_ids,
  related_event_ids,
  source_span_ids,
  detected_at
)
on conflict (case_id, issue_key) do update
set
  issue_type = excluded.issue_type,
  severity = excluded.severity,
  status = excluded.status,
  title = excluded.title,
  description = excluded.description,
  provenance_summary = excluded.provenance_summary,
  related_fact_ids = excluded.related_fact_ids,
  related_event_ids = excluded.related_event_ids,
  source_span_ids = excluded.source_span_ids,
  detected_at = excluded.detected_at,
  updated_at = now();
