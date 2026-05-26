import { z } from "zod";

import { findingDraftImportanceSchema, findingDraftProblemSchema } from "@/lib/contracts/harness";

export const HARNESS_V2_VERSION = "harness.v2";

export const harnessV2AnnotationCandidateSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  value: z.preprocess(
    (value) => (value === "" ? null : value),
    z.union([z.string(), z.number(), z.boolean()]).nullable().default(null),
  ),
  note: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().nullable().default(null),
  ),
  importance: findingDraftImportanceSchema.default("medium"),
  problem: z.preprocess(
    (value) => (value === "" || value === "none" ? null : value),
    findingDraftProblemSchema.nullable().default(null),
  ),
  sourceQuotes: z.array(z.string().min(1)).default([]),
  extras: z.record(z.string(), z.unknown()).default({}),
});

export type HarnessV2AnnotationCandidate = z.infer<
  typeof harnessV2AnnotationCandidateSchema
>;

export const harnessV2DocumentAnnotationSchema = z.object({
  documentType: z.string().min(1).default("unknown"),
  candidates: z.array(harnessV2AnnotationCandidateSchema).default([]),
  extractionWarnings: z.array(z.string().min(1)).default([]),
}).passthrough();

export type HarnessV2DocumentAnnotation = z.infer<
  typeof harnessV2DocumentAnnotationSchema
>;

export function harnessV2DocumentAnnotationJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["documentType", "candidates", "extractionWarnings"],
    properties: {
      documentType: { type: "string" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "title",
            "value",
            "note",
            "importance",
            "problem",
            "sourceQuotes",
          ],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            value: { type: "string" },
            note: { type: "string" },
            importance: {
              type: "string",
              enum: ["critical", "high", "medium", "low", "info"],
            },
            problem: {
              type: "string",
              enum: [
                "none",
                "missing",
                "unclear",
                "conflict",
                "unsupported",
                "external_law",
              ],
            },
            sourceQuotes: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      extractionWarnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  } satisfies Record<string, unknown>;
}
