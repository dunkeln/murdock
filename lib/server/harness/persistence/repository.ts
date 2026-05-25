import "server-only";

import type { ControlStatus } from "@/lib/agui";
import { HARNESS_VERSION, type HarnessError } from "@/lib/contracts/harness";
import { createNeonSql } from "@/lib/server/adapters/neon";
import type {
  HarnessRunArtifactKind,
  HarnessRunStepStatus,
} from "@/lib/server/harness/workflows/v1/run";

type JsonRecord = Record<string, unknown>;

export type HarnessRunSourceInput = {
  documentSha256: string | null;
  fileName: string;
  ocrConversionId: string | null;
  pagesProcessed: number | null;
  provider: string;
  providerModel: string;
  sourceDocumentId?: string | null;
  sourceKey: string;
};

function jsonb(value: unknown) {
  return JSON.stringify(value ?? {});
}

export async function startHarnessRun(input: {
  caseId: string;
  fileCount: number;
  firmId: string;
  runId: string;
  workflowName?: string;
}) {
  const sql = createNeonSql();

  await sql`
    insert into public.harness_runs (
      id,
      case_id,
      firm_id,
      harness_version,
      workflow_name,
      status,
      file_count,
      started_at
    )
    values (
      ${input.runId},
      ${input.caseId},
      ${input.firmId},
      ${HARNESS_VERSION},
      ${input.workflowName ?? "workspace.shape-from-ocr"},
      'running',
      ${input.fileCount},
      now()
    )
    on conflict (id) do update
    set
      case_id = excluded.case_id,
      firm_id = excluded.firm_id,
      harness_version = excluded.harness_version,
      workflow_name = excluded.workflow_name,
      status = 'running',
      final_status = null,
      file_count = excluded.file_count,
      error = null,
      completed_at = null,
      updated_at = now()
  `;
}

export async function recordHarnessRunSources(input: {
  caseId: string;
  runId: string;
  sources: HarnessRunSourceInput[];
}) {
  const sql = createNeonSql();

  await Promise.all(
    input.sources.map((source, index) =>
      sql`
        insert into public.harness_run_sources (
          run_id,
          case_id,
          source_key,
          file_name,
          ocr_conversion_id,
          document_sha256,
          provider,
          provider_model,
          pages_processed,
          source_document_id,
          ordinal
        )
        values (
          ${input.runId},
          ${input.caseId},
          ${source.sourceKey},
          ${source.fileName},
          ${source.ocrConversionId},
          ${source.documentSha256},
          ${source.provider},
          ${source.providerModel},
          ${source.pagesProcessed},
          ${source.sourceDocumentId ?? null},
          ${index}
        )
        on conflict (run_id, source_key) do update
        set
          file_name = excluded.file_name,
          ocr_conversion_id = excluded.ocr_conversion_id,
          document_sha256 = excluded.document_sha256,
          provider = excluded.provider,
          provider_model = excluded.provider_model,
          pages_processed = excluded.pages_processed,
          source_document_id = excluded.source_document_id,
          ordinal = excluded.ordinal,
          updated_at = now()
      `,
    ),
  );
}

export async function recordHarnessRunStepStarted(input: {
  caseId: string;
  ordinal: number;
  runId: string;
  sourceKey: string | null;
  stepName: string;
}) {
  const sql = createNeonSql();

  await sql`
    insert into public.harness_run_steps (
      run_id,
      case_id,
      source_key,
      step_name,
      ordinal,
      status,
      metrics,
      error,
      started_at,
      completed_at
    )
    values (
      ${input.runId},
      ${input.caseId},
      ${input.sourceKey},
      ${input.stepName},
      ${input.ordinal},
      'started',
      '{}'::jsonb,
      null,
      now(),
      null
    )
    on conflict (
      run_id,
      (coalesce(source_key, '')),
      step_name
    ) do update
    set
      ordinal = excluded.ordinal,
      status = 'started',
      metrics = '{}'::jsonb,
      error = null,
      started_at = now(),
      completed_at = null,
      updated_at = now()
  `;
}

export async function recordHarnessRunStepFinished(input: {
  caseId: string;
  error: HarnessError | null;
  metrics: JsonRecord;
  ordinal: number;
  runId: string;
  sourceKey: string | null;
  status: Exclude<HarnessRunStepStatus, "started">;
  stepName: string;
}) {
  const sql = createNeonSql();

  await sql`
    insert into public.harness_run_steps (
      run_id,
      case_id,
      source_key,
      step_name,
      ordinal,
      status,
      metrics,
      error,
      started_at,
      completed_at
    )
    values (
      ${input.runId},
      ${input.caseId},
      ${input.sourceKey},
      ${input.stepName},
      ${input.ordinal},
      ${input.status},
      ${jsonb(input.metrics)}::jsonb,
      ${input.error ? jsonb(input.error) : null}::jsonb,
      now(),
      now()
    )
    on conflict (
      run_id,
      (coalesce(source_key, '')),
      step_name
    ) do update
    set
      ordinal = excluded.ordinal,
      status = excluded.status,
      metrics = excluded.metrics,
      error = excluded.error,
      completed_at = now(),
      updated_at = now()
  `;
}

export async function recordHarnessRunArtifact(input: {
  artifact: unknown;
  caseId: string;
  kind: HarnessRunArtifactKind | "workspace_shape";
  ordinal: number;
  runId: string;
  sourceKey: string | null;
  status: Exclude<HarnessRunStepStatus, "started">;
  stepName: string | null;
  summary: JsonRecord;
}) {
  const sql = createNeonSql();

  await sql`
    insert into public.harness_run_artifacts (
      run_id,
      case_id,
      source_key,
      artifact_kind,
      step_name,
      ordinal,
      status,
      artifact,
      summary
    )
    values (
      ${input.runId},
      ${input.caseId},
      ${input.sourceKey},
      ${input.kind},
      ${input.stepName},
      ${input.ordinal},
      ${input.status},
      ${jsonb(input.artifact)}::jsonb,
      ${jsonb(input.summary)}::jsonb
    )
    on conflict (
      run_id,
      (coalesce(source_key, '')),
      artifact_kind,
      (coalesce(step_name, ''))
    ) do update
    set
      ordinal = excluded.ordinal,
      status = excluded.status,
      artifact = excluded.artifact,
      summary = excluded.summary,
      updated_at = now()
  `;
}

export async function finishHarnessRun(input: {
  error?: unknown;
  finalBundle?: unknown;
  finalShape?: unknown;
  finalStatus: Extract<ControlStatus, "ready" | "needs_review" | "failed">;
  model?: string | null;
  provider?: string | null;
  runId: string;
  stats: JsonRecord;
  usage?: { inputTokens: number | null; outputTokens: number | null } | null;
}) {
  const sql = createNeonSql();

  await sql`
    update public.harness_runs
    set
      status = ${input.finalStatus},
      final_status = ${input.finalStatus},
      provider = ${input.provider ?? null},
      model = ${input.model ?? null},
      input_tokens = ${input.usage?.inputTokens ?? null},
      output_tokens = ${input.usage?.outputTokens ?? null},
      stats = ${jsonb(input.stats)}::jsonb,
      final_bundle = ${input.finalBundle ? jsonb(input.finalBundle) : null}::jsonb,
      final_shape = ${input.finalShape ? jsonb(input.finalShape) : null}::jsonb,
      error = ${input.error ? jsonb(input.error) : null}::jsonb,
      completed_at = now(),
      updated_at = now()
    where id = ${input.runId}
  `;
}
