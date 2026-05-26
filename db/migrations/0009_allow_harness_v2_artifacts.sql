alter table public.ocr_conversions
  add column if not exists document_annotation jsonb null;

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
      'error'
    )
  );
