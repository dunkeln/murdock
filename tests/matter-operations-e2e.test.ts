import { loadEnvConfig } from "@next/env";

import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

loadEnvConfig(process.cwd());

const runE2e = process.env.RUN_MATTER_OPERATIONS_E2E === "1";
const maybeDescribe = runE2e ? describe : describe.skip;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

maybeDescribe("matter operations e2e", () => {
  it("projects review actions and revision claims into current matter state", async () => {
    const { createNeonSql } = await import("@/lib/server/adapters/neon");
    const {
      getMatterOperationalSnapshot,
      listMatterOperationEventsByCaseId,
      recordMatterOperationEvent,
    } = await import("@/lib/server/matter-operations/service");
    const sql = createNeonSql();
    const caseId = randomUUID();
    const harnessRunId = randomUUID();
    const reducerRunId = randomUUID();
    const sourceDocumentIds = [randomUUID(), randomUUID(), randomUUID()];
    const familyId = randomUUID();
    const versionIds = [randomUUID(), randomUUID(), randomUUID()];

    try {
      await sql`
        insert into public.cases (id, user_id, slug, title, type, priority)
        values (
          ${caseId},
          'matter-operations-e2e',
          ${`matter-operations-${caseId}`},
          'Matter operations E2E',
          'general',
          'normal'
        )
      `;
      await sql`
        insert into public.harness_runs (
          id,
          case_id,
          firm_id,
          harness_version,
          workflow_name,
          status,
          final_status
        )
        values (
          ${harnessRunId},
          ${caseId},
          'matter-operations-e2e',
          'harness.v2',
          'matter-operations-e2e',
          'ready',
          'ready'
        )
      `;
      await sql`
        insert into public.case_review_reducer_runs (
          id,
          case_id,
          harness_run_id,
          reducer_version,
          status,
          completed_at
        )
        values (
          ${reducerRunId},
          ${caseId},
          ${harnessRunId},
          'review-reducer.e2e',
          'succeeded',
          now()
        )
      `;
      await sql`
        insert into public.case_review_actions (
          case_id,
          reducer_run_id,
          action_key,
          kind,
          priority,
          required_capability,
          blocking,
          status,
          title,
          summary,
          action_label,
          raw_refs
        )
        values (
          ${caseId},
          ${reducerRunId},
          'e2e.missing.signature',
          'missing',
          'high',
          'factual_completion',
          true,
          'open',
          'Signature missing',
          'The filing signature block is blank.',
          'Complete signature',
          '[]'::jsonb
        )
      `;
      await Promise.all(
        sourceDocumentIds.map((sourceDocumentId, index) =>
          sql`
            insert into public.case_source_documents (
              id,
              case_id,
              source_key,
              title,
              file_name,
              source_kind
            )
            values (
              ${sourceDocumentId},
              ${caseId},
              ${`source-${index + 1}`},
              ${`Source ${index + 1}`},
              ${`source-${index + 1}.pdf`},
              'pleading'
            )
          `,
        ),
      );
      await sql`
        insert into public.document_families (
          id,
          case_id,
          family_key,
          label
        )
        values (
          ${familyId},
          ${caseId},
          'e2e-complaint',
          'Complaint'
        )
      `;
      await Promise.all(
        versionIds.map((versionId, index) =>
          sql`
            insert into public.document_versions (
              id,
              case_id,
              document_family_id,
              source_document_id,
              version_index,
              label,
              snapshot_json,
              snapshot_text,
              snapshot_hash
            )
            values (
              ${versionId},
              ${caseId},
              ${familyId},
              ${sourceDocumentIds[index]},
              ${index + 1},
              ${`v${index + 1}`},
              '{}'::jsonb,
              ${`version ${index + 1}`},
              ${hash(`version-${index + 1}`)}
            )
          `,
        ),
      );
      await sql`
        insert into public.document_revision_claims (
          case_id,
          document_family_id,
          from_document_version_id,
          to_document_version_id,
          field_path,
          field_label,
          change_type,
          before_value,
          after_value,
          confidence
        )
        values
          (
            ${caseId},
            ${familyId},
            ${versionIds[0]},
            ${versionIds[1]},
            'caption.plaintiff',
            'Plaintiff',
            'changed',
            '"Old plaintiff"'::jsonb,
            '"New plaintiff"'::jsonb,
            'high'
          ),
          (
            ${caseId},
            ${familyId},
            ${versionIds[1]},
            ${versionIds[2]},
            'caption.plaintiff',
            'Plaintiff',
            'changed',
            '"New plaintiff"'::jsonb,
            '"Newest plaintiff"'::jsonb,
            'high'
          )
      `;

      const initialSnapshot = await getMatterOperationalSnapshot({
        caseId,
        includeHistory: true,
      });
      expect(initialSnapshot.counts.totalOperationCount).toBe(3);
      expect(initialSnapshot.counts.activeOperationCount).toBe(2);
      expect(initialSnapshot.counts.blockingActiveOperationCount).toBe(1);
      expect(initialSnapshot.counts.supersededOperationCount).toBe(1);
      expect(
        initialSnapshot.currentOperations.some(
          (operation) => operation.state === "superseded",
        ),
      ).toBe(false);

      await sql`
        update public.case_review_actions
        set status = 'resolved', resolved_at = now(), updated_at = now()
        where case_id = ${caseId}
          and action_key = 'e2e.missing.signature'
      `;
      const resolvedSnapshot = await getMatterOperationalSnapshot({
        caseId,
        includeHistory: true,
      });
      expect(resolvedSnapshot.counts.activeOperationCount).toBe(1);
      expect(resolvedSnapshot.counts.resolvedOperationCount).toBe(1);

      const activeRevision = resolvedSnapshot.activeOperations.find(
        (operation) => operation.sourceType === "revision_claim",
      );
      expect(activeRevision).toBeDefined();
      if (!activeRevision) {
        throw new Error("Expected active revision operation.");
      }

      await recordMatterOperationEvent({
        actorId: "matter-operations-e2e",
        caseId,
        eventType: "ignored",
        note: "Not relevant to current filing.",
        operationId: activeRevision.id,
      });
      const ignoredSnapshot = await getMatterOperationalSnapshot({
        caseId,
        includeHistory: true,
      });
      expect(ignoredSnapshot.counts.activeOperationCount).toBe(0);
      expect(ignoredSnapshot.counts.ignoredOperationCount).toBe(1);

      await recordMatterOperationEvent({
        actorId: "matter-operations-e2e",
        caseId,
        eventType: "marked_untracked",
        note: "Remove from operational readiness.",
        operationId: activeRevision.id,
      });
      const untrackedSnapshot = await getMatterOperationalSnapshot({
        caseId,
        includeHistory: true,
      });
      expect(untrackedSnapshot.counts.activeOperationCount).toBe(0);
      expect(untrackedSnapshot.counts.untrackedOperationCount).toBe(1);

      const events = await listMatterOperationEventsByCaseId({ caseId });
      expect(events.some((event) => event.eventType === "superseded")).toBe(true);
      expect(events.some((event) => event.eventType === "ignored")).toBe(true);
      expect(events.some((event) => event.eventType === "marked_untracked")).toBe(
        true,
      );
    } finally {
      await sql`delete from public.cases where id = ${caseId}`;
    }
  });
});
