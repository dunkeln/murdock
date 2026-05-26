import { z } from "zod";

export const operationalCapabilitySchema = z.enum([
  "factual_completion",
  "source_verification",
  "legal_judgment",
  "filing_preparation",
  "document_version_review",
  "timeline_management",
  "operational_followup",
]);

export type OperationalCapability = z.infer<
  typeof operationalCapabilitySchema
>;
