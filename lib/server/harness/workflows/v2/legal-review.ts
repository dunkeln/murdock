import "server-only";

import type { Finding, FindingDraft } from "@/lib/contracts/harness";
import {
  harnessV2DocumentAnnotationSchema,
  type HarnessV2DocumentAnnotation,
} from "@/lib/contracts/harness-v2";
import { compileDraft, type RawDraft } from "@/lib/server/harness/workflows/v1/draft";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

type LegalReviewContext = {
  annotation: HarnessV2DocumentAnnotation | null;
  normalizedText: string;
  source: SourceMap;
};

type LegalReviewCandidate = {
  id: string;
  importance: FindingDraft["importance"];
  note: string;
  problem: NonNullable<FindingDraft["problem"]>;
  sourceSpanIds: string[];
  title: string;
  type: string;
};

type Ud100Rule = {
  id: string;
  importance: FindingDraft["importance"];
  note: string;
  problem: NonNullable<FindingDraft["problem"]>;
  quotePatterns: RegExp[];
  test: (ctx: LegalReviewContext) => boolean;
  title: string;
  type: string;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function annotationDocumentType(input: unknown) {
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
    const quote = normalizeText(span.quote);

    if (patterns.some((pattern) => pattern.test(quote))) {
      ids.add(span.id);
    }
  }

  return [...ids].slice(0, 3);
}

function isUd100(ctx: LegalReviewContext) {
  const declaredType = normalizeText(ctx.annotation?.documentType ?? "");

  return (
    declaredType.includes("ud_100") ||
    declaredType.includes("ud-100") ||
    hasAll(ctx.normalizedText, ["ud-100", "complaint", "unlawful detainer"])
  );
}

const ud100Rules: Ud100Rule[] = [
  {
    id: "complaint-amended-complaint-conflict",
    importance: "high",
    note:
      "The form has both Complaint and Amended Complaint checked. Only one filing posture should control.",
    problem: "conflict",
    quotePatterns: [/complaint\s+☑\s+amended complaint/],
    test: (ctx) => hasAll(ctx.normalizedText, ["☑ complaint", "☑ amended complaint"]),
    title: "Complaint and amended complaint both selected",
    type: "checkbox_conflict",
  },
  {
    id: "jurisdiction-amount-conflict",
    importance: "high",
    note:
      "The limited civil amount demanded selections conflict because both under and over $10,000 are checked.",
    problem: "conflict",
    quotePatterns: [/amount demanded.*does not exceed \$10,000.*exceeds \$10,000/],
    test: (ctx) =>
      hasAll(ctx.normalizedText, [
        "☑ does not exceed $10,000",
        "☑ exceeds $10,000",
      ]),
    title: "Jurisdiction amount selections conflict",
    type: "amount_conflict",
  },
  {
    id: "plaintiff-type-conflict",
    importance: "high",
    note:
      "The plaintiff type section marks both an individual over 18 and a public agency.",
    problem: "conflict",
    quotePatterns: [/plaintiff is.*individual over the age of 18.*public agency/],
    test: (ctx) =>
      hasAll(ctx.normalizedText, [
        "☑ an individual over the age of 18",
        "☑ a public agency",
      ]),
    title: "Plaintiff type selections conflict",
    type: "party_conflict",
  },
  {
    id: "case-number-missing",
    importance: "high",
    note: "The case number field appears blank in the caption.",
    problem: "missing",
    quotePatterns: [/case number/],
    test: (ctx) => matches(ctx.normalizedText, /case number:\s*(?:\||$)/),
    title: "Case number not assigned",
    type: "missing_case_number",
  },
  {
    id: "caption-plaintiff-missing",
    importance: "critical",
    note: "The plaintiff caption line is blank.",
    problem: "missing",
    quotePatterns: [/plaintiff:\s*defendant:/, /plaintiff:\s*\|\s*case number/],
    test: (ctx) =>
      matches(ctx.normalizedText, /plaintiff:\s*defendant:/) ||
      matches(ctx.normalizedText, /plaintiff:\s*\|\s*case number/),
    title: "Plaintiff name missing from caption",
    type: "missing_party",
  },
  {
    id: "caption-defendant-missing",
    importance: "critical",
    note: "The defendant caption line is blank.",
    problem: "missing",
    quotePatterns: [/defendant:\s*☐ does/, /defendant:\s*\|/],
    test: (ctx) =>
      matches(ctx.normalizedText, /defendant:\s*☐ does/) ||
      matches(ctx.normalizedText, /defendant:\s*\|/),
    title: "Defendant name missing from caption",
    type: "missing_party",
  },
  {
    id: "premises-address-missing",
    importance: "critical",
    note: "The premises address field in item 3a appears blank.",
    problem: "missing",
    quotePatterns: [/premises located at/, /street address, apartment number/],
    test: (ctx) =>
      matches(
        ctx.normalizedText,
        /premises located at .*?:\s*(?:<br\/>)?b\. the premises/,
      ),
    title: "Premises address not filled in",
    type: "missing_premises_address",
  },
  {
    id: "premises-location-conflict",
    importance: "high",
    note:
      "The form checks both city-limits and unincorporated-area premises location options.",
    problem: "conflict",
    quotePatterns: [/within the city limits.*within the unincorporated area/],
    test: (ctx) =>
      hasAll(ctx.normalizedText, [
        "☑ within the city limits",
        "☑ within the unincorporated area",
      ]),
    title: "Premises location selections conflict",
    type: "venue_conflict",
  },
  {
    id: "plaintiff-interest-missing",
    importance: "high",
    note: "Item 4 does not indicate whether plaintiff claims ownership or another interest.",
    problem: "missing",
    quotePatterns: [/plaintiff's interest in the premises/],
    test: (ctx) =>
      hasAll(ctx.normalizedText, [
        "plaintiff's interest in the premises is ☐ as owner ☐ other",
      ]),
    title: "Plaintiff interest in premises not selected",
    type: "missing_property_interest",
  },
  {
    id: "tenancy-commencement-date-missing",
    importance: "high",
    note: "Item 6a does not provide the date the tenancy began.",
    problem: "missing",
    quotePatterns: [/on or about \(date\)/],
    test: (ctx) => matches(ctx.normalizedText, /on or about \(date\):\s*defendant/),
    title: "Tenancy commencement date missing",
    type: "missing_date",
  },
  {
    id: "rent-amount-missing",
    importance: "high",
    note: "Item 6a leaves the agreed rent amount blank.",
    problem: "missing",
    quotePatterns: [/agreed to pay rent of/],
    test: (ctx) =>
      matches(ctx.normalizedText, /agreed to pay rent of \$\s*_{2,}/),
    title: "Agreed rent amount missing",
    type: "missing_amount",
  },
  {
    id: "rent-frequency-missing",
    importance: "medium",
    note: "The rent frequency options are not selected.",
    problem: "missing",
    quotePatterns: [/payable ☐ monthly ☐ other/],
    test: (ctx) => ctx.normalizedText.includes("payable ☐ monthly ☐ other"),
    title: "Rent payment frequency not selected",
    type: "missing_rent_frequency",
  },
  {
    id: "rental-agreement-counterparty-missing",
    importance: "high",
    note: "The form marks an oral agreement but does not identify who made it.",
    problem: "missing",
    quotePatterns: [/this ☐ written ☑ oral agreement was made with/],
    test: (ctx) =>
      ctx.normalizedText.includes("this ☐ written ☑ oral agreement was made with"),
    title: "Rental agreement counterparty not identified",
    type: "missing_party",
  },
  {
    id: "tenant-protection-act-status-missing",
    importance: "high",
    note: "Item 7 does not select whether the tenancy is subject to the Tenant Protection Act.",
    problem: "missing",
    quotePatterns: [/tenant protection act/],
    test: (ctx) =>
      hasAll(ctx.normalizedText, [
        "a. ☐ is not subject to the tenant protection act",
        "b. ☐ is subject to the tenant protection act",
      ]),
    title: "Tenant Protection Act status not selected",
    type: "missing_tenant_protection_status",
  },
  {
    id: "notice-expiration-date-missing",
    importance: "high",
    note: "Item 9b does not state the date the notice period expired.",
    problem: "missing",
    quotePatterns: [/on \(date\): the period stated in the notice/],
    test: (ctx) =>
      ctx.normalizedText.includes(
        "on (date): the period stated in the notice checked in 9a expired",
      ),
    title: "Notice expiration date missing",
    type: "missing_date",
  },
  {
    id: "notice-exhibit-missing",
    importance: "high",
    note: "The required Exhibit 2 notice copy is not marked as attached.",
    problem: "missing",
    quotePatterns: [/copy of the notice is attached and labeled exhibit 2/],
    test: (ctx) =>
      ctx.normalizedText.includes(
        "☐ a copy of the notice is attached and labeled exhibit 2",
      ),
    title: "Exhibit 2 notice copy not attached",
    type: "missing_attachment",
  },
  {
    id: "notice-service-method-missing",
    importance: "high",
    note: "Item 10 does not select a service method for the notice.",
    problem: "missing",
    quotePatterns: [/the notice in item 9a was served/],
    test: (ctx) =>
      ctx.normalizedText.includes(
        "10. a. ☐ the notice in item 9a was served",
      ),
    title: "Notice service method not selected",
    type: "missing_notice_service_method",
  },
  {
    id: "proof-of-service-exhibit-missing",
    importance: "high",
    note: "The required Exhibit 3 proof of service is not marked as attached.",
    problem: "missing",
    quotePatterns: [/proof of service of the notice in item 9a is attached/],
    test: (ctx) =>
      ctx.normalizedText.includes(
        "☐ proof of service of the notice in item 9a is attached",
      ),
    title: "Exhibit 3 proof of service not attached",
    type: "missing_attachment",
  },
  {
    id: "rental-assistance-statements-missing",
    importance: "high",
    note:
      "The rental assistance section required for nonpayment actions is not completed.",
    problem: "missing",
    quotePatterns: [/statements regarding rental assistance/, /plaintiff ☐ has received/],
    test: (ctx) =>
      ctx.normalizedText.includes("11. ☐ statements regarding rental assistance") ||
      ctx.normalizedText.includes("plaintiff ☐ has received ☐ has not received"),
    title: "Rental assistance statements not completed",
    type: "missing_rental_assistance",
  },
  {
    id: "past-due-rent-missing",
    importance: "medium",
    note: "Item 13 does not state the past-due rent amount.",
    problem: "missing",
    quotePatterns: [/amount of rent due was \$/],
    test: (ctx) =>
      ctx.normalizedText.includes("amount of rent due was $"),
    title: "Past-due rent amount missing",
    type: "missing_amount",
  },
  {
    id: "fair-rental-value-missing",
    importance: "medium",
    note: "Item 14 does not state the fair rental value per day.",
    problem: "missing",
    quotePatterns: [/fair rental value of the premises is/],
    test: (ctx) =>
      ctx.normalizedText.includes("the fair rental value of the premises is $ per day"),
    title: "Fair rental value per day missing",
    type: "missing_amount",
  },
  {
    id: "rent-control-ordinance-not-completed",
    importance: "medium",
    note: "Item 17 is not completed even though it asks about local rent or eviction control.",
    problem: "unclear",
    quotePatterns: [/local rent control or eviction control ordinance/],
    test: (ctx) =>
      ctx.normalizedText.includes(
        "☐ defendant's tenancy is subject to the local rent control or eviction control ordinance",
      ),
    title: "Rent control ordinance applicability not completed",
    type: "missing_context",
  },
  {
    id: "complaint-signature-date-missing",
    importance: "critical",
    note: "The complaint signature block date appears blank.",
    problem: "missing",
    quotePatterns: [/signature of plaintiff or attorney/, /date:/],
    test: (ctx) =>
      matches(
        ctx.normalizedText,
        /date:\s*\(type or print name\)\s*\(signature of plaintiff or attorney\)/,
      ),
    title: "Complaint signature date missing",
    type: "missing_signature_date",
  },
  {
    id: "complaint-signature-missing",
    importance: "critical",
    note: "The plaintiff or attorney signature line appears blank.",
    problem: "missing",
    quotePatterns: [/signature of plaintiff or attorney/],
    test: (ctx) =>
      ctx.normalizedText.includes("(signature of plaintiff or attorney)"),
    title: "Plaintiff or attorney signature missing",
    type: "missing_signature",
  },
  {
    id: "verification-date-missing",
    importance: "critical",
    note: "The verification date appears blank.",
    problem: "missing",
    quotePatterns: [/verification/, /signature of plaintiff/],
    test: (ctx) =>
      matches(
        ctx.normalizedText,
        /verification.*date:\s*[a-z .'-]+\s*\(type or print name\)\s*\(signature of plaintiff\)/,
      ),
    title: "Verification date missing",
    type: "missing_signature_date",
  },
  {
    id: "verification-signature-missing",
    importance: "critical",
    note: "The verification signature line appears blank.",
    problem: "missing",
    quotePatterns: [/verification/, /signature of plaintiff/],
    test: (ctx) => ctx.normalizedText.includes("(signature of plaintiff)"),
    title: "Plaintiff verification signature missing",
    type: "missing_signature",
  },
  {
    id: "unlawful-detainer-assistant-disclosure-missing",
    importance: "medium",
    note: "Item 22 requires an unlawful detainer assistant disclosure, but neither option is selected.",
    problem: "missing",
    quotePatterns: [/unlawful detainer assistant/, /did not ☐ did/],
    test: (ctx) =>
      ctx.normalizedText.includes("unlawful detainer assistant") &&
      ctx.normalizedText.includes("☐ did not ☐ did"),
    title: "Unlawful detainer assistant disclosure not selected",
    type: "missing_disclosure",
  },
];

function ud100Candidates(ctx: LegalReviewContext): LegalReviewCandidate[] {
  if (!isUd100(ctx)) {
    return [];
  }

  return ud100Rules.flatMap((rule) => {
    if (!rule.test(ctx)) {
      return [];
    }

    return [
      {
        id: rule.id,
        importance: rule.importance,
        note: rule.note,
        problem: rule.problem,
        sourceSpanIds: sourceSpanIdsForPatterns(ctx.source, rule.quotePatterns),
        title: rule.title,
        type: rule.type,
      },
    ];
  });
}

function toFinding(input: {
  candidate: LegalReviewCandidate;
  index: number;
  source: SourceMap;
}) {
  const doc = input.source.docs[0];

  if (!doc) {
    return null;
  }

  const raw: RawDraft = {
    importance: input.candidate.importance,
    note: input.candidate.note,
    problem: input.candidate.problem,
    sourceSpanIds: input.candidate.sourceSpanIds,
    title: input.candidate.title,
    type: input.candidate.type,
  };

  return compileDraft({
    doc,
    index: 10_000 + input.index,
    raw,
    segment: {
      index: 0,
      spans: input.source.sourceSpans,
      text: input.source.fullText,
    },
  });
}

export function compileHarnessV2LegalReview(input: {
  annotation: unknown;
  source: SourceMap;
}): Finding[] {
  const ctx: LegalReviewContext = {
    annotation: annotationDocumentType(input.annotation),
    normalizedText: normalizeText(input.source.fullText),
    source: input.source,
  };
  const candidates = ud100Candidates(ctx);

  return candidates.flatMap((candidate, index) => {
    const finding = toFinding({ candidate, index, source: input.source });

    return finding ? [finding] : [];
  });
}
