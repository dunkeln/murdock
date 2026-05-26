import "server-only";

import type { FindingDraft } from "@/lib/contracts/harness";

import type { LegalReviewCandidate, LegalReviewFormState } from "../types";

type Ud100Rule = {
  id: string;
  importance: FindingDraft["importance"];
  note: string;
  problem: NonNullable<FindingDraft["problem"]>;
  sourceSpanIds: (state: LegalReviewFormState) => string[];
  test: (state: LegalReviewFormState) => boolean;
  title: string;
  type: string;
};

function fieldMissing(state: LegalReviewFormState, fieldKey: string) {
  return state.fields[fieldKey]?.state === "missing";
}

function fieldSources(state: LegalReviewFormState, fieldKey: string) {
  return state.fields[fieldKey]?.sourceSpanIds ?? [];
}

function attachmentNotMarked(state: LegalReviewFormState, attachmentKey: string) {
  return state.attachments[attachmentKey]?.markedAttached === false;
}

function attachmentSources(state: LegalReviewFormState, attachmentKey: string) {
  return state.attachments[attachmentKey]?.sourceSpanIds ?? [];
}

function signatureValue(
  state: LegalReviewFormState,
  signatureKey: string,
  field: "dated" | "signed",
) {
  return state.signatures[signatureKey]?.[field] === false;
}

function signatureSources(state: LegalReviewFormState, signatureKey: string) {
  return state.signatures[signatureKey]?.sourceSpanIds ?? [];
}

function groupHasEvery(
  state: LegalReviewFormState,
  groupKey: string,
  requiredValues: string[],
) {
  const checked = new Set(state.checkboxGroups[groupKey]?.checked ?? []);

  return requiredValues.every((value) => checked.has(value));
}

function groupSources(state: LegalReviewFormState, groupKey: string) {
  return state.checkboxGroups[groupKey]?.sourceSpanIds ?? [];
}

const ud100Rules: Ud100Rule[] = [
  {
    id: "complaint-amended-complaint-conflict",
    importance: "high",
    note:
      "The form has both Complaint and Amended Complaint checked. Only one filing posture should control.",
    problem: "conflict",
    sourceSpanIds: (state) => groupSources(state, "filingType"),
    test: (state) =>
      groupHasEvery(state, "filingType", ["complaint", "amendedComplaint"]),
    title: "Complaint and amended complaint both selected",
    type: "checkbox_conflict",
  },
  {
    id: "jurisdiction-amount-conflict",
    importance: "high",
    note:
      "The limited civil amount demanded selections conflict because both under and over $10,000 are checked.",
    problem: "conflict",
    sourceSpanIds: (state) => groupSources(state, "jurisdictionAmount"),
    test: (state) =>
      groupHasEvery(state, "jurisdictionAmount", [
        "notExceed10000",
        "exceeds10000",
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
    sourceSpanIds: (state) => groupSources(state, "plaintiffType"),
    test: (state) =>
      groupHasEvery(state, "plaintiffType", ["adultIndividual", "publicAgency"]),
    title: "Plaintiff type selections conflict",
    type: "party_conflict",
  },
  {
    id: "case-number-missing",
    importance: "high",
    note: "The case number field appears blank in the caption.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "caseNumber"),
    test: (state) => fieldMissing(state, "caseNumber"),
    title: "Case number not assigned",
    type: "missing_case_number",
  },
  {
    id: "caption-plaintiff-missing",
    importance: "critical",
    note: "The plaintiff caption line is blank.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "plaintiffName"),
    test: (state) => fieldMissing(state, "plaintiffName"),
    title: "Plaintiff name missing from caption",
    type: "missing_party",
  },
  {
    id: "caption-defendant-missing",
    importance: "critical",
    note: "The defendant caption line is blank.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "defendantName"),
    test: (state) => fieldMissing(state, "defendantName"),
    title: "Defendant name missing from caption",
    type: "missing_party",
  },
  {
    id: "premises-address-missing",
    importance: "critical",
    note: "The premises address field in item 3a appears blank.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "premisesAddress"),
    test: (state) => fieldMissing(state, "premisesAddress"),
    title: "Premises address not filled in",
    type: "missing_premises_address",
  },
  {
    id: "premises-location-conflict",
    importance: "high",
    note:
      "The form checks both city-limits and unincorporated-area premises location options.",
    problem: "conflict",
    sourceSpanIds: (state) => groupSources(state, "premisesLocation"),
    test: (state) =>
      groupHasEvery(state, "premisesLocation", [
        "cityLimits",
        "unincorporatedArea",
      ]),
    title: "Premises location selections conflict",
    type: "venue_conflict",
  },
  {
    id: "plaintiff-interest-missing",
    importance: "high",
    note: "Item 4 does not indicate whether plaintiff claims ownership or another interest.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "plaintiffInterest"),
    test: (state) => fieldMissing(state, "plaintiffInterest"),
    title: "Plaintiff interest in premises not selected",
    type: "missing_property_interest",
  },
  {
    id: "tenancy-commencement-date-missing",
    importance: "high",
    note: "Item 6a does not provide the date the tenancy began.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "tenancyCommencementDate"),
    test: (state) => fieldMissing(state, "tenancyCommencementDate"),
    title: "Tenancy commencement date missing",
    type: "missing_date",
  },
  {
    id: "rent-amount-missing",
    importance: "high",
    note: "Item 6a leaves the agreed rent amount blank.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "rentAmount"),
    test: (state) => fieldMissing(state, "rentAmount"),
    title: "Agreed rent amount missing",
    type: "missing_amount",
  },
  {
    id: "rent-frequency-missing",
    importance: "medium",
    note: "The rent frequency options are not selected.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "rentFrequency"),
    test: (state) => fieldMissing(state, "rentFrequency"),
    title: "Rent payment frequency not selected",
    type: "missing_rent_frequency",
  },
  {
    id: "rental-agreement-counterparty-missing",
    importance: "high",
    note: "The form marks an oral agreement but does not identify who made it.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "rentalAgreementCounterparty"),
    test: (state) => fieldMissing(state, "rentalAgreementCounterparty"),
    title: "Rental agreement counterparty not identified",
    type: "missing_party",
  },
  {
    id: "tenant-protection-act-status-missing",
    importance: "high",
    note: "Item 7 does not select whether the tenancy is subject to the Tenant Protection Act.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "tenantProtectionActStatus"),
    test: (state) => fieldMissing(state, "tenantProtectionActStatus"),
    title: "Tenant Protection Act status not selected",
    type: "missing_tenant_protection_status",
  },
  {
    id: "notice-expiration-date-missing",
    importance: "high",
    note: "Item 9b does not state the date the notice period expired.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "noticeExpirationDate"),
    test: (state) => fieldMissing(state, "noticeExpirationDate"),
    title: "Notice expiration date missing",
    type: "missing_date",
  },
  {
    id: "notice-exhibit-missing",
    importance: "high",
    note: "The required Exhibit 2 notice copy is not marked as attached.",
    problem: "missing",
    sourceSpanIds: (state) => attachmentSources(state, "exhibit2NoticeCopy"),
    test: (state) => attachmentNotMarked(state, "exhibit2NoticeCopy"),
    title: "Exhibit 2 notice copy not attached",
    type: "missing_attachment",
  },
  {
    id: "notice-service-method-missing",
    importance: "high",
    note: "Item 10 does not select a service method for the notice.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "noticeServiceMethod"),
    test: (state) => fieldMissing(state, "noticeServiceMethod"),
    title: "Notice service method not selected",
    type: "missing_notice_service_method",
  },
  {
    id: "proof-of-service-exhibit-missing",
    importance: "high",
    note: "The required Exhibit 3 proof of service is not marked as attached.",
    problem: "missing",
    sourceSpanIds: (state) => attachmentSources(state, "exhibit3ProofOfService"),
    test: (state) => attachmentNotMarked(state, "exhibit3ProofOfService"),
    title: "Exhibit 3 proof of service not attached",
    type: "missing_attachment",
  },
  {
    id: "rental-assistance-statements-missing",
    importance: "high",
    note:
      "The rental assistance section required for nonpayment actions is not completed.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "rentalAssistanceStatements"),
    test: (state) => fieldMissing(state, "rentalAssistanceStatements"),
    title: "Rental assistance statements not completed",
    type: "missing_rental_assistance",
  },
  {
    id: "past-due-rent-missing",
    importance: "medium",
    note: "Item 13 does not state the past-due rent amount.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "pastDueRentAmount"),
    test: (state) => fieldMissing(state, "pastDueRentAmount"),
    title: "Past-due rent amount missing",
    type: "missing_amount",
  },
  {
    id: "fair-rental-value-missing",
    importance: "medium",
    note: "Item 14 does not state the fair rental value per day.",
    problem: "missing",
    sourceSpanIds: (state) => fieldSources(state, "fairRentalValue"),
    test: (state) => fieldMissing(state, "fairRentalValue"),
    title: "Fair rental value per day missing",
    type: "missing_amount",
  },
  {
    id: "rent-control-ordinance-not-completed",
    importance: "medium",
    note: "Item 17 is not completed even though it asks about local rent or eviction control.",
    problem: "unclear",
    sourceSpanIds: (state) => fieldSources(state, "rentControlOrdinance"),
    test: (state) => fieldMissing(state, "rentControlOrdinance"),
    title: "Rent control ordinance applicability not completed",
    type: "missing_context",
  },
  {
    id: "complaint-signature-date-missing",
    importance: "critical",
    note: "The complaint signature block date appears blank.",
    problem: "missing",
    sourceSpanIds: (state) => signatureSources(state, "complaint"),
    test: (state) => signatureValue(state, "complaint", "dated"),
    title: "Complaint signature date missing",
    type: "missing_signature_date",
  },
  {
    id: "complaint-signature-missing",
    importance: "critical",
    note: "The plaintiff or attorney signature line appears blank.",
    problem: "missing",
    sourceSpanIds: (state) => signatureSources(state, "complaint"),
    test: (state) => signatureValue(state, "complaint", "signed"),
    title: "Plaintiff or attorney signature missing",
    type: "missing_signature",
  },
  {
    id: "verification-date-missing",
    importance: "critical",
    note: "The verification date appears blank.",
    problem: "missing",
    sourceSpanIds: (state) => signatureSources(state, "verification"),
    test: (state) => signatureValue(state, "verification", "dated"),
    title: "Verification date missing",
    type: "missing_signature_date",
  },
  {
    id: "verification-signature-missing",
    importance: "critical",
    note: "The verification signature line appears blank.",
    problem: "missing",
    sourceSpanIds: (state) => signatureSources(state, "verification"),
    test: (state) => signatureValue(state, "verification", "signed"),
    title: "Plaintiff verification signature missing",
    type: "missing_signature",
  },
  {
    id: "unlawful-detainer-assistant-disclosure-missing",
    importance: "medium",
    note: "Item 22 requires an unlawful detainer assistant disclosure, but neither option is selected.",
    problem: "missing",
    sourceSpanIds: (state) =>
      fieldSources(state, "unlawfulDetainerAssistantDisclosure"),
    test: (state) => fieldMissing(state, "unlawfulDetainerAssistantDisclosure"),
    title: "Unlawful detainer assistant disclosure not selected",
    type: "missing_disclosure",
  },
];

export function reviewCaUd100(state: LegalReviewFormState): LegalReviewCandidate[] {
  if (state.formType !== "ca_ud_100") {
    return [];
  }

  return ud100Rules.flatMap((rule) => {
    if (!rule.test(state)) {
      return [];
    }

    return [
      {
        id: rule.id,
        importance: rule.importance,
        note: rule.note,
        problem: rule.problem,
        sourceSpanIds: rule.sourceSpanIds(state),
        title: rule.title,
        type: rule.type,
      },
    ];
  });
}
