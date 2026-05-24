create table if not exists public.ocr_conversions (
  id uuid primary key default gen_random_uuid(),
  firm_id text not null,
  document_sha256 text not null,
  provider text not null,
  provider_model text not null,
  status text not null default 'pending',
  markdown text null,
  pages_processed integer null,
  error_message text null,
  expires_at timestamptz not null default (now() + interval '2 days'),
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ocr_conversions_document_sha256_check check (
    document_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint ocr_conversions_provider_check check (provider in ('mistral')),
  constraint ocr_conversions_status_check check (
    status in ('pending', 'processing', 'ready', 'failed')
  ),
  constraint ocr_conversions_pages_processed_check check (
    pages_processed is null or pages_processed >= 0
  )
);

create unique index if not exists ocr_conversions_active_provider_document_idx
  on public.ocr_conversions (firm_id, document_sha256, provider, provider_model)
  where deleted_at is null;

create index if not exists ocr_conversions_firm_expires_idx
  on public.ocr_conversions (firm_id, expires_at)
  where deleted_at is null;

create index if not exists ocr_conversions_firm_status_updated_idx
  on public.ocr_conversions (firm_id, status, updated_at desc)
  where deleted_at is null;
