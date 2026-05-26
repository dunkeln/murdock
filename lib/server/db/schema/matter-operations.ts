import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const caseReviewActions = pgTable("case_review_actions", {
  actionKey: text("action_key").notNull(),
  actionLabel: text("action_label").notNull(),
  blocking: boolean("blocking").notNull(),
  caseId: uuid("case_id").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  priority: text("priority").notNull(),
  rawRefs: jsonb("raw_refs").$type<unknown>().notNull(),
  reducerRunId: uuid("reducer_run_id").notNull(),
  requiredCapability: text("required_capability").notNull(),
  sourceSpanIds: uuid("source_span_ids").array().notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  title: text("title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentRevisionClaims = pgTable("document_revision_claims", {
  afterSourceSpanIds: uuid("after_source_span_ids").array().notNull(),
  caseId: uuid("case_id").notNull(),
  changeType: text("change_type").notNull(),
  confidence: text("confidence").notNull(),
  documentFamilyId: uuid("document_family_id").notNull(),
  fieldLabel: text("field_label").notNull(),
  fieldPath: text("field_path").notNull(),
  fromDocumentVersionId: uuid("from_document_version_id").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").notNull(),
  toDocumentVersionId: uuid("to_document_version_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentVersions = pgTable("document_versions", {
  caseId: uuid("case_id").notNull(),
  documentFamilyId: uuid("document_family_id").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotHash: text("snapshot_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  versionIndex: integer("version_index").notNull(),
});

export const matterOperations = pgTable("matter_operations", {
  blocking: boolean("blocking").notNull(),
  caseId: uuid("case_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  current: boolean("current").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  operationKey: text("operation_key").notNull(),
  previousSourceHash: text("previous_source_hash"),
  priority: text("priority").notNull(),
  provenanceRefs: jsonb("provenance_refs").$type<unknown>().notNull(),
  requiredCapability: text("required_capability").notNull(),
  sourceHash: text("source_hash"),
  sourceId: uuid("source_id").notNull(),
  sourceRunId: uuid("source_run_id"),
  sourceType: text("source_type").notNull(),
  state: text("state").notNull(),
  summary: text("summary").notNull(),
  supersededByOperationId: uuid("superseded_by_operation_id"),
  title: text("title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matterOperationEvents = pgTable("matter_operation_events", {
  actorId: text("actor_id"),
  caseId: uuid("case_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  eventKey: text("event_key"),
  eventType: text("event_type").notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  note: text("note"),
  operationId: uuid("operation_id").notNull(),
});
