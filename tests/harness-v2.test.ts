import { describe, expect, it } from "vitest";

import { harnessV2DocumentAnnotationJsonSchema } from "@/lib/contracts/harness-v2";
import { compileHarnessV2Annotation } from "@/lib/server/harness/workflows/v2/compile";
import { compileHarnessV2LegalReview } from "@/lib/server/harness/workflows/v2/legal-review";
import { runHarnessV2FromAnnotatedConversion } from "@/lib/server/harness/workflows/v2/run";
import { buildSourceMapFromConversion } from "@/lib/server/harness/workflows/v1/source";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";

const caseId = "11111111-1111-4111-8111-111111111111";

const conversion: OcrConversionDto = {
  id: "22222222-2222-4222-8222-222222222222",
  firmId: "firm-1",
  documentSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  provider: "mistral",
  providerModel: "mistral-ocr-latest",
  status: "ready",
  markdown:
    "Plaintiff: Jane Owner.\n\nThe complaint is not signed by plaintiff or attorney.",
  documentAnnotation: null,
  pagesProcessed: 1,
  errorMessage: null,
  expiresAt: "2026-02-03T19:20:00.000Z",
  deletedAt: null,
  createdAt: "2026-02-01T19:20:00.000Z",
  updatedAt: "2026-02-01T19:20:00.000Z",
};

const annotation = {
  documentType: "ud_100_complaint",
  candidates: [
    {
      type: "party",
      title: "Plaintiff",
      value: "Jane Owner",
      note: "The complaint names Jane Owner as plaintiff.",
      importance: "medium",
      sourceQuotes: ["Plaintiff: Jane Owner."],
    },
    {
      type: "signature_gap",
      title: "Complaint signature missing",
      note: "The complaint is not signed by plaintiff or attorney.",
      importance: "critical",
      problem: "missing",
      sourceQuotes: ["not signed by plaintiff or attorney"],
    },
  ],
  extractionWarnings: [],
};

const checked = "\u2611";
const unchecked = "\u2610";

const ud100Markdown = [
  "UD-100",
  "",
  "PLAINTIFF:",
  "DEFENDANT:",
  `${unchecked} DOES 1 TO`,
  "",
  `COMPLAINT-UNLAWFUL DETAINER ${checked} COMPLAINT ${checked} AMENDED COMPLAINT (Amendment Number): | CASE NUMBER: |`,
  "",
  `Amount demanded ${checked} does not exceed $10,000 ${checked} exceeds $10,000`,
  "",
  `2. a. Plaintiff is (1) ${checked} an individual over the age of 18 years. (2) ${checked} a public agency.`,
  "",
  "3. a. The venue is the court named above because defendant named above is in possession of the premises located at (street address, apartment number, city, zip code, and county):<br/>b. The premises in 3a are (check one)",
  `(1) ${checked} within the city limits of (name of city):`,
  `(2) ${checked} within the unincorporated area of (name of county):`,
  "",
  `4. Plaintiff's interest in the premises is ${unchecked} as owner ${unchecked} other (specify):`,
  "",
  "6. a. On or about (date):",
  "defendant (name each):",
  `(2) agreed to pay rent of $ __________ payable ${unchecked} monthly ${unchecked} other (specify frequency):`,
  `b. This ${unchecked} written ${checked} oral agreement was made with`,
  "",
  `7. The tenancy described in item 6 a. ${unchecked} is not subject to the Tenant Protection Act b. ${unchecked} is subject to the Tenant Protection Act`,
  "",
  "9. b. (1) On (date): the period stated in the notice checked in 9a expired at the end of the day.",
  `e. ${unchecked} A copy of the notice is attached and labeled Exhibit 2.`,
  "",
  `10. a. ${unchecked} The notice in item 9a was served on the defendant named in item 9a as follows:`,
  `d. ${unchecked} Proof of service of the notice in item 9a is attached and labeled Exhibit 3.`,
  "",
  `11. ${unchecked} Statements regarding rental assistance`,
  `a. Plaintiff ${unchecked} has received ${unchecked} has not received rental assistance.`,
  "",
  `13. ${unchecked} At the time the 3-day notice to pay rent or quit was served, the amount of rent due was $`,
  `14. ${unchecked} The fair rental value of the premises is $ per day.`,
  "",
  `17. ${unchecked} Defendant's tenancy is subject to the local rent control or eviction control ordinance`,
  "",
  "Date:",
  "(TYPE OR PRINT NAME)",
  "(SIGNATURE OF PLAINTIFF OR ATTORNEY)",
  "",
  "# VERIFICATION",
  "Date:",
  "John Doe",
  "(TYPE OR PRINT NAME)",
  "(SIGNATURE OF PLAINTIFF)",
].join("\n");

const ud100Conversion: OcrConversionDto = {
  ...conversion,
  id: "33333333-3333-4333-8333-333333333333",
  documentSha256:
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  markdown: ud100Markdown,
};

const ud100Annotation = {
  documentType: "ud_100_complaint",
  candidates: [
    {
      type: "document_type",
      title: "UD-100 complaint",
      value: "UD-100",
      note: "The document is a UD-100 complaint.",
      importance: "high",
      problem: null,
      sourceQuotes: ["UD-100"],
    },
  ],
  extractionWarnings: [],
};

describe("harness v2", () => {
  it("exposes a JSON schema for Mistral document annotations", () => {
    const schema = harnessV2DocumentAnnotationJsonSchema();

    expect(schema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        candidates: expect.any(Object),
        documentType: expect.any(Object),
      }),
    });
  });

  it("compiles Mistral annotation candidates through the existing draft compiler", () => {
    const source = buildSourceMapFromConversion({
      caseId,
      conversion,
      docId: "source-1",
      fileName: "ud-100.pdf",
    });
    const findings = compileHarnessV2Annotation({ annotation, source });

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      kind: "fact",
      status: "confirmed",
      title: "Plaintiff",
    });
    expect(findings[0]?.sourceSpans).toHaveLength(1);
    expect(findings[1]).toMatchObject({
      kind: "missing_info",
      materiality: "critical",
      status: "missing",
    });
  });

  it("returns the same downstream bundle shape as harness v1", async () => {
    const result = await runHarnessV2FromAnnotatedConversion({
      annotation,
      caseId,
      conversion,
      docId: "source-1",
      fileName: "ud-100.pdf",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.bundle.version).toBe("harness.v1");
    expect(result.bundle.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.bundle.gates.length).toBeGreaterThan(0);
  });

  it("adds deterministic V2 legal-review findings for known UD-100 defects", () => {
    const source = buildSourceMapFromConversion({
      caseId,
      conversion: ud100Conversion,
      docId: "source-ud100",
      fileName: "ud-100.pdf",
    });
    const findings = compileHarnessV2LegalReview({
      annotation: ud100Annotation,
      source,
    });
    const titles = findings.map((finding) => finding.title);

    expect(titles).toContain("Complaint and amended complaint both selected");
    expect(titles).toContain("Jurisdiction amount selections conflict");
    expect(titles).toContain("Plaintiff type selections conflict");
    expect(titles).toContain("Premises address not filled in");
    expect(titles).toContain("Notice expiration date missing");
    expect(titles).toContain("Plaintiff verification signature missing");
    expect(findings.length).toBeGreaterThanOrEqual(20);
    expect(
      findings.find(
        (finding) => finding.title === "Jurisdiction amount selections conflict",
      ),
    ).toMatchObject({
      status: "conflicting",
      materiality: "high",
    });
    expect(
      findings.find((finding) => finding.title === "Premises address not filled in")
        ?.sourceSpans.length,
    ).toBeGreaterThan(0);
  });

  it("keeps V2 legal-review enrichment inside the existing bundle contract", async () => {
    const result = await runHarnessV2FromAnnotatedConversion({
      annotation: ud100Annotation,
      caseId,
      conversion: ud100Conversion,
      docId: "source-ud100",
      fileName: "ud-100.pdf",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.version).toBe("harness.v1");
    expect(result.bundle.findings.map((finding) => finding.title)).toContain(
      "Complaint signature date missing",
    );
    expect(result.bundle.gates.length).toBe(result.bundle.findings.length);
  });
});
