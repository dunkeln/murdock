import "server-only";

import {
  harnessV2DocumentAnnotationSchema,
  type HarnessV2DocumentAnnotation,
} from "@/lib/contracts/harness-v2";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

import type {
  LegalReviewAttachmentState,
  LegalReviewCheckboxGroupState,
  LegalReviewFieldState,
  LegalReviewFormState,
  LegalReviewSignatureState,
} from "./types";

const checkedBox = "\u2611";
const uncheckedBox = "\u2610";

export function normalizeLegalReviewText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function annotationDocumentType(input: unknown): HarnessV2DocumentAnnotation | null {
  const parsed = harnessV2DocumentAnnotationSchema.safeParse(input);

  return parsed.success ? parsed.data : null;
}

function hasAll(text: string, needles: string[]) {
  return needles.every((needle) => text.includes(needle.toLowerCase()));
}

function matches(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function sourceSpanIdsForPatterns(source: SourceMap, patterns: RegExp[]) {
  const ids = new Set<string>();

  for (const span of source.sourceSpans) {
    const quote = normalizeLegalReviewText(span.quote);

    if (patterns.some((pattern) => pattern.test(quote))) {
      ids.add(span.id);
    }
  }

  return [...ids].slice(0, 3);
}

function fieldState(input: {
  isMissing: boolean;
  patterns: RegExp[];
  source: SourceMap;
  value?: string | null;
}): LegalReviewFieldState {
  return {
    sourceSpanIds: sourceSpanIdsForPatterns(input.source, input.patterns),
    state: input.isMissing ? "missing" : "unknown",
    value: input.value ?? null,
  };
}

function checkboxGroup(input: {
  checked: string[];
  patterns: RegExp[];
  source: SourceMap;
}): LegalReviewCheckboxGroupState {
  return {
    checked: input.checked,
    sourceSpanIds: sourceSpanIdsForPatterns(input.source, input.patterns),
  };
}

function attachmentState(input: {
  isUnchecked: boolean;
  patterns: RegExp[];
  source: SourceMap;
}): LegalReviewAttachmentState {
  return {
    markedAttached: input.isUnchecked ? false : null,
    sourceSpanIds: sourceSpanIdsForPatterns(input.source, input.patterns),
  };
}

function signatureState(input: {
  dated: boolean | null;
  patterns: RegExp[];
  signed: boolean | null;
  source: SourceMap;
}): LegalReviewSignatureState {
  return {
    dated: input.dated,
    signed: input.signed,
    sourceSpanIds: sourceSpanIdsForPatterns(input.source, input.patterns),
  };
}

function isUd100(input: {
  annotation: HarnessV2DocumentAnnotation | null;
  normalizedText: string;
}) {
  const declaredType = normalizeLegalReviewText(input.annotation?.documentType ?? "");

  return (
    declaredType.includes("ud_100") ||
    declaredType.includes("ud-100") ||
    hasAll(input.normalizedText, ["ud-100", "complaint", "unlawful detainer"])
  );
}

function checkedWhen(text: string, label: string) {
  return text.includes(`${checkedBox} ${label.toLowerCase()}`);
}

function ud100Fields(input: {
  normalizedText: string;
  source: SourceMap;
}): Record<string, LegalReviewFieldState> {
  const text = input.normalizedText;

  return {
    caseNumber: fieldState({
      isMissing: matches(text, /case number:\s*(?:\||$)/),
      patterns: [/case number/],
      source: input.source,
    }),
    plaintiffName: fieldState({
      isMissing:
        matches(text, /plaintiff:\s*defendant:/) ||
        matches(text, /plaintiff:\s*\|\s*case number/),
      patterns: [/plaintiff:\s*defendant:/, /plaintiff:\s*\|\s*case number/],
      source: input.source,
    }),
    defendantName: fieldState({
      isMissing:
        matches(text, /defendant:\s*☐ does/) ||
        matches(text, /defendant:\s*\|/),
      patterns: [/defendant:\s*☐ does/, /defendant:\s*\|/],
      source: input.source,
    }),
    premisesAddress: fieldState({
      isMissing: matches(
        text,
        /premises located at .*?:\s*(?:<br\/>)?b\. the premises/,
      ),
      patterns: [/premises located at/, /street address, apartment number/],
      source: input.source,
    }),
    plaintiffInterest: fieldState({
      isMissing: hasAll(text, [
        `plaintiff's interest in the premises is ${uncheckedBox} as owner ${uncheckedBox} other`,
      ]),
      patterns: [/plaintiff's interest in the premises/],
      source: input.source,
    }),
    tenancyCommencementDate: fieldState({
      isMissing: matches(text, /on or about \(date\):\s*defendant/),
      patterns: [/on or about \(date\)/],
      source: input.source,
    }),
    rentAmount: fieldState({
      isMissing: matches(text, /agreed to pay rent of \$\s*_{2,}/),
      patterns: [/agreed to pay rent of/],
      source: input.source,
    }),
    rentFrequency: fieldState({
      isMissing: text.includes(`payable ${uncheckedBox} monthly ${uncheckedBox} other`),
      patterns: [/payable ☐ monthly ☐ other/],
      source: input.source,
    }),
    rentalAgreementCounterparty: fieldState({
      isMissing: text.includes(
        `this ${uncheckedBox} written ${checkedBox} oral agreement was made with`,
      ),
      patterns: [/this ☐ written ☑ oral agreement was made with/],
      source: input.source,
    }),
    tenantProtectionActStatus: fieldState({
      isMissing: hasAll(text, [
        `a. ${uncheckedBox} is not subject to the tenant protection act`,
        `b. ${uncheckedBox} is subject to the tenant protection act`,
      ]),
      patterns: [/tenant protection act/],
      source: input.source,
    }),
    noticeExpirationDate: fieldState({
      isMissing: text.includes(
        "on (date): the period stated in the notice checked in 9a expired",
      ),
      patterns: [/on \(date\): the period stated in the notice/],
      source: input.source,
    }),
    noticeServiceMethod: fieldState({
      isMissing: text.includes(
        `10. a. ${uncheckedBox} the notice in item 9a was served`,
      ),
      patterns: [/the notice in item 9a was served/],
      source: input.source,
    }),
    rentalAssistanceStatements: fieldState({
      isMissing:
        text.includes(`11. ${uncheckedBox} statements regarding rental assistance`) ||
        text.includes(
          `plaintiff ${uncheckedBox} has received ${uncheckedBox} has not received`,
        ),
      patterns: [/statements regarding rental assistance/, /plaintiff ☐ has received/],
      source: input.source,
    }),
    pastDueRentAmount: fieldState({
      isMissing: text.includes("amount of rent due was $"),
      patterns: [/amount of rent due was \$/],
      source: input.source,
    }),
    fairRentalValue: fieldState({
      isMissing: text.includes("the fair rental value of the premises is $ per day"),
      patterns: [/fair rental value of the premises is/],
      source: input.source,
    }),
    rentControlOrdinance: fieldState({
      isMissing: text.includes(
        `${uncheckedBox} defendant's tenancy is subject to the local rent control or eviction control ordinance`,
      ),
      patterns: [/local rent control or eviction control ordinance/],
      source: input.source,
    }),
    unlawfulDetainerAssistantDisclosure: fieldState({
      isMissing:
        text.includes("unlawful detainer assistant") &&
        text.includes(`${uncheckedBox} did not ${uncheckedBox} did`),
      patterns: [/unlawful detainer assistant/, /did not ☐ did/],
      source: input.source,
    }),
  };
}

function ud100CheckboxGroups(input: {
  normalizedText: string;
  source: SourceMap;
}): Record<string, LegalReviewCheckboxGroupState> {
  const text = input.normalizedText;

  return {
    filingType: checkboxGroup({
      checked: [
        ...(checkedWhen(text, "complaint") ? ["complaint"] : []),
        ...(checkedWhen(text, "amended complaint") ? ["amendedComplaint"] : []),
      ],
      patterns: [/complaint\s+☑\s+amended complaint/],
      source: input.source,
    }),
    jurisdictionAmount: checkboxGroup({
      checked: [
        ...(checkedWhen(text, "does not exceed $10,000") ? ["notExceed10000"] : []),
        ...(checkedWhen(text, "exceeds $10,000") ? ["exceeds10000"] : []),
      ],
      patterns: [/amount demanded.*does not exceed \$10,000.*exceeds \$10,000/],
      source: input.source,
    }),
    plaintiffType: checkboxGroup({
      checked: [
        ...(checkedWhen(text, "an individual over the age of 18") ? ["adultIndividual"] : []),
        ...(checkedWhen(text, "a public agency") ? ["publicAgency"] : []),
      ],
      patterns: [/plaintiff is.*individual over the age of 18.*public agency/],
      source: input.source,
    }),
    premisesLocation: checkboxGroup({
      checked: [
        ...(checkedWhen(text, "within the city limits") ? ["cityLimits"] : []),
        ...(checkedWhen(text, "within the unincorporated area") ? ["unincorporatedArea"] : []),
      ],
      patterns: [/within the city limits.*within the unincorporated area/],
      source: input.source,
    }),
  };
}

function ud100Attachments(input: {
  normalizedText: string;
  source: SourceMap;
}): Record<string, LegalReviewAttachmentState> {
  const text = input.normalizedText;

  return {
    exhibit2NoticeCopy: attachmentState({
      isUnchecked: text.includes(
        `${uncheckedBox} a copy of the notice is attached and labeled exhibit 2`,
      ),
      patterns: [/copy of the notice is attached and labeled exhibit 2/],
      source: input.source,
    }),
    exhibit3ProofOfService: attachmentState({
      isUnchecked: text.includes(
        `${uncheckedBox} proof of service of the notice in item 9a is attached`,
      ),
      patterns: [/proof of service of the notice in item 9a is attached/],
      source: input.source,
    }),
  };
}

function ud100Signatures(input: {
  normalizedText: string;
  source: SourceMap;
}): Record<string, LegalReviewSignatureState> {
  const text = input.normalizedText;

  return {
    complaint: signatureState({
      dated: matches(
        text,
        /date:\s*\(type or print name\)\s*\(signature of plaintiff or attorney\)/,
      )
        ? false
        : null,
      patterns: [/signature of plaintiff or attorney/, /date:/],
      signed: text.includes("(signature of plaintiff or attorney)") ? false : null,
      source: input.source,
    }),
    verification: signatureState({
      dated: matches(
        text,
        /verification.*date:\s*[a-z .'-]+\s*\(type or print name\)\s*\(signature of plaintiff\)/,
      )
        ? false
        : null,
      patterns: [/verification/, /signature of plaintiff/],
      signed: text.includes("(signature of plaintiff)") ? false : null,
      source: input.source,
    }),
  };
}

export function buildLegalReviewFormState(input: {
  annotation: unknown;
  source: SourceMap;
}): LegalReviewFormState {
  const annotation = annotationDocumentType(input.annotation);
  const normalizedText = normalizeLegalReviewText(input.source.fullText);
  const formType = isUd100({ annotation, normalizedText }) ? "ca_ud_100" : "unknown";

  if (formType !== "ca_ud_100") {
    return {
      annotation,
      attachments: {},
      checkboxGroups: {},
      fields: {},
      formType,
      normalizedText,
      signatures: {},
      source: input.source,
    };
  }

  return {
    annotation,
    attachments: ud100Attachments({ normalizedText, source: input.source }),
    checkboxGroups: ud100CheckboxGroups({ normalizedText, source: input.source }),
    fields: ud100Fields({ normalizedText, source: input.source }),
    formType,
    normalizedText,
    signatures: ud100Signatures({ normalizedText, source: input.source }),
    source: input.source,
  };
}
