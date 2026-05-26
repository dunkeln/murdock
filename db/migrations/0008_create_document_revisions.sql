create table if not exists public.document_families (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  family_key text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_families_family_key_check check (length(btrim(family_key)) > 0),
  constraint document_families_label_check check (length(btrim(label)) > 0),
  constraint document_families_case_family_key_unique unique (case_id, family_key)
);

create index if not exists document_families_case_updated_idx
  on public.document_families (case_id, updated_at desc, id desc);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_family_id uuid not null references public.document_families(id) on delete cascade,
  source_document_id uuid not null references public.case_source_documents(id) on delete cascade,
  case_document_id uuid null references public.case_documents(id) on delete set null,
  version_index integer not null,
  label text not null,
  snapshot_json jsonb not null,
  snapshot_text text not null,
  snapshot_hash text not null,
  uploaded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_versions_version_index_check check (version_index >= 1),
  constraint document_versions_label_check check (length(btrim(label)) > 0),
  constraint document_versions_snapshot_text_check check (length(btrim(snapshot_text)) > 0),
  constraint document_versions_snapshot_hash_check check (
    snapshot_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint document_versions_source_document_unique unique (source_document_id),
  constraint document_versions_family_index_unique unique (
    document_family_id,
    version_index
  )
);

create index if not exists document_versions_case_family_idx
  on public.document_versions (case_id, document_family_id, version_index asc);

create index if not exists document_versions_family_latest_idx
  on public.document_versions (document_family_id, version_index desc);

create index if not exists document_versions_case_document_idx
  on public.document_versions (case_document_id)
  where case_document_id is not null;

create table if not exists public.document_revision_claims (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  document_family_id uuid not null references public.document_families(id) on delete cascade,
  from_document_version_id uuid not null references public.document_versions(id) on delete cascade,
  to_document_version_id uuid not null references public.document_versions(id) on delete cascade,
  field_path text not null,
  field_label text not null,
  change_type text not null,
  before_value jsonb null,
  after_value jsonb null,
  before_source_span_ids uuid[] not null default '{}',
  after_source_span_ids uuid[] not null default '{}',
  confidence text not null default 'medium',
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_revision_claims_field_path_check check (
    length(btrim(field_path)) > 0
  ),
  constraint document_revision_claims_field_label_check check (
    length(btrim(field_label)) > 0
  ),
  constraint document_revision_claims_change_type_check check (
    change_type in ('added', 'removed', 'changed', 'unchanged_with_new_source')
  ),
  constraint document_revision_claims_confidence_check check (
    confidence in ('low', 'medium', 'high')
  ),
  constraint document_revision_claims_status_check check (
    status in ('candidate', 'confirmed', 'dismissed')
  ),
  constraint document_revision_claims_version_order_check check (
    from_document_version_id <> to_document_version_id
  ),
  constraint document_revision_claims_edge_field_unique unique (
    from_document_version_id,
    to_document_version_id,
    field_path,
    change_type
  )
);

create index if not exists document_revision_claims_case_family_idx
  on public.document_revision_claims (
    case_id,
    document_family_id,
    created_at desc,
    id desc
  );

create index if not exists document_revision_claims_candidate_idx
  on public.document_revision_claims (
    case_id,
    document_family_id,
    created_at desc,
    id desc
  )
  where status = 'candidate';

create index if not exists document_revision_claims_to_version_idx
  on public.document_revision_claims (to_document_version_id);

create index if not exists document_revision_claims_family_status_idx
  on public.document_revision_claims (
    document_family_id,
    status,
    created_at desc,
    id desc
  );
