import "server-only";

import { harnessV2DocumentAnnotationJsonSchema } from "@/lib/contracts/harness-v2";

export const HARNESS_V2_ANNOTATION_SCHEMA_NAME = "murdock_harness_v2_annotation";

export function harnessV2AnnotationResponseFormat() {
  return {
    type: "json_schema" as const,
    jsonSchema: {
      name: HARNESS_V2_ANNOTATION_SCHEMA_NAME,
      description:
        "Structured legal-document extraction candidates for Murdock Harness V2.",
      schemaDefinition: harnessV2DocumentAnnotationJsonSchema(),
      strict: true,
    },
  };
}

export const HARNESS_V2_DOCUMENT_ANNOTATION_PROMPT = [
  "Extract only information grounded in the uploaded legal document.",
  "Return candidates for facts, issues, timeline events, missing information, obligations, signatures, and document quality.",
  "For Judicial Council forms, explicitly mark blank required fields, placeholder-only signature/date lines, unchecked required alternatives, mutually exclusive boxes that are both checked, and checked attachment references whose exhibit is not present in the OCR.",
  "Use sourceQuotes as short exact snippets from the OCR text that support each candidate.",
  "Use null for missing values. Do not infer facts that are not present.",
  "Prefer fewer high-signal candidates over a long noisy list.",
].join("\n");
