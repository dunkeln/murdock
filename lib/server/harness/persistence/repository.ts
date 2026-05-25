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

type HarnessSourceRunStateRow = {
  failed_run_count: number | string;
  has_completed_run: boolean;
  has_running_run: boolean;
  source_key: string;
};

type HarnessSourceClaimRow = {
  source_key: string;
};

function jsonb(value: unknown) {
  return JSON.stringify(value ?? {});
}

export async function getHarnessSourceRunStateByCase(input: {
  caseId: string;
  sourceKeys: readonly string[];
}) {
  const sql = createNeonSql();
  const sourceKeys = [...new Set(input.sourceKeys)];

  if (sourceKeys.length === 0) {
    return {
      completedSourceKeys: [],
      failedRunCountsBySourceKey: {},
      runningSourceKeys: [],
    };
  }

  const rows = (await sql`
    select
      hrs.source_key,
      bool_or(hr.status = 'running') as has_running_run,
      count(*) filter (where hr.status = 'failed') as failed_run_count,
      bool_or(
        hr.harness_version = ${HARNESS_VERSION}
        and hr.status in ('ready', 'needs_review')
        and hr.final_status in ('ready', 'needs_review')
      ) as has_completed_run
    from public.harness_run_sources hrs
    join public.harness_runs hr on hr.id = hrs.run_id
    where hrs.case_id = ${input.caseId}
      and hrs.source_key = any(${sourceKeys})
    group by hrs.source_key
  `) as HarnessSourceRunStateRow[];

  return {
    completedSourceKeys: rows
      .filter((row) => row.has_completed_run)
      .map((row) => row.source_key),
    failedRunCountsBySourceKey: Object.fromEntries(
      rows.map((row) => [row.source_key, Number(row.failed_run_count)]),
    ),
    runningSourceKeys: rows
      .filter((row) => row.has_running_run)
      .map((row) => row.source_key),
  };
}

export async function claimHarnessSourcesForRun(input: {
  caseId: string;
  runId: string;
  sourceKeys: readonly string[];
}) {
  const sql = createNeonSql();
  const sourceKeys = [...new Set(input.sourceKeys)];

  if (sourceKeys.length === 0) {
    return [];
  }

  const rows = (await sql`
    insert into public.harness_source_claims (
      case_id,
      source_key,
      run_id,
      status,
      expires_at
    )
    select
      ${input.caseId},
      source_key,
      ${input.runId},
      'running',
      now() + interval '10 minutes'
    from unnest(${sourceKeys}::text[]) as input_source(source_key)
    on conflict (case_id, source_key) do update
    set
      run_id = excluded.run_id,
      status = 'running',
      expires_at = excluded.expires_at,
      updated_at = now()
    where public.harness_source_claims.status <> 'running'
      or public.harness_source_claims.expires_at < now()
    returning source_key
  `) as HarnessSourceClaimRow[];

  return rows.map((row) => row.source_key);
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

  await sql`
    update public.harness_source_claims
    set
      status = ${input.finalStatus},
      expires_at = now(),
      updated_at = now()
    where run_id = ${input.runId}
  `;
}
