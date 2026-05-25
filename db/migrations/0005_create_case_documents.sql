create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  firm_id text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  document_sha256 text not null,
  storage_kind text not null default 'database_bytea',
  object_key text null,
  file_bytes bytea null,
  ocr_conversion_id uuid null references public.ocr_conversions(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_documents_firm_id_check check (length(btrim(firm_id)) > 0),
  constraint case_documents_file_name_check check (length(btrim(file_name)) > 0),
  constraint case_documents_mime_type_check check (length(btrim(mime_type)) > 0),
  constraint case_documents_size_bytes_check check (size_bytes > 0),
  constraint case_documents_document_sha256_check check (
    document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint case_documents_storage_kind_check check (
    storage_kind in ('database_bytea', 'object_storage')
  ),
  constraint case_documents_storage_payload_check check (
    (storage_kind = 'database_bytea' and file_bytes is not null)
    or (storage_kind = 'object_storage' and object_key is not null)
  ),
  constraint case_documents_case_document_unique unique (case_id, document_sha256)
);

create index if not exists case_documents_case_uploaded_idx
  on public.case_documents (case_id, uploaded_at desc, id desc);

create index if not exists case_documents_firm_sha_idx
  on public.case_documents (firm_id, document_sha256);

create index if not exists case_documents_case_ocr_idx
  on public.case_documents (case_id, ocr_conversion_id)
  where ocr_conversion_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'case_source_documents_case_document_id_fkey'
      and conrelid = 'public.case_source_documents'::regclass
  ) then
    alter table public.case_source_documents
      add constraint case_source_documents_case_document_id_fkey
      foreign key (case_document_id)
      references public.case_documents(id)
      on delete set null;
  end if;
end $$;
