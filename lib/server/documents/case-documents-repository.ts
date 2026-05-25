import "server-only";

import { createNeonSql } from "@/lib/server/adapters/neon";

type CaseDocumentRow = {
  id: string;
  case_id: string;
  firm_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  document_sha256: string;
  storage_kind: "database_bytea" | "object_storage";
  object_key: string | null;
  file_bytes?: Buffer | string | Uint8Array | null;
  ocr_conversion_id: string | null;
  uploaded_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseDocumentDto = {
  caseId: string;
  documentSha256: string;
  fileName: string;
  firmId: string;
  id: string;
  mimeType: string;
  ocrConversionId: string | null;
  sizeBytes: number;
};

export type CaseDocumentFileDto = CaseDocumentDto & {
  bytes: Uint8Array;
};

function byteaToUint8Array(value: Buffer | string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    const hex = value.startsWith("\\x") ? value.slice(2) : value;
    const bytes = new Uint8Array(hex.length / 2);

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }

    return bytes;
  }

  return new Uint8Array(value);
}

function toCaseDocumentDto(row: CaseDocumentRow): CaseDocumentDto {
  return {
    caseId: row.case_id,
    documentSha256: row.document_sha256,
    fileName: row.file_name,
    firmId: row.firm_id,
    id: row.id,
    mimeType: row.mime_type,
    ocrConversionId: row.ocr_conversion_id,
    sizeBytes: row.size_bytes,
  };
}

export async function upsertCaseDocument(input: {
  bytes: Uint8Array;
  caseId: string;
  documentSha256: string;
  fileName: string;
  firmId: string;
  mimeType: string;
  ocrConversionId: string | null;
  sizeBytes: number;
}): Promise<CaseDocumentDto> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.case_documents (
      case_id,
      firm_id,
      file_name,
      mime_type,
      size_bytes,
      document_sha256,
      storage_kind,
      object_key,
      file_bytes,
      ocr_conversion_id
    )
    values (
      ${input.caseId},
      ${input.firmId},
      ${input.fileName},
      ${input.mimeType || "application/octet-stream"},
      ${input.sizeBytes},
      ${input.documentSha256},
      'database_bytea',
      null,
      ${Buffer.from(input.bytes)},
      ${input.ocrConversionId}
    )
    on conflict (case_id, document_sha256) do update
    set
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      storage_kind = excluded.storage_kind,
      object_key = excluded.object_key,
      file_bytes = excluded.file_bytes,
      ocr_conversion_id = excluded.ocr_conversion_id,
      updated_at = now()
    returning
      id,
      case_id,
      firm_id,
      file_name,
      mime_type,
      size_bytes,
      document_sha256,
      storage_kind,
      object_key,
      ocr_conversion_id,
      uploaded_at,
      created_at,
      updated_at
  `;
  const [row] = rows as CaseDocumentRow[];

  return toCaseDocumentDto(row);
}

export async function getCaseDocumentFileForUser(input: {
  documentId: string;
  userId: string;
}): Promise<CaseDocumentFileDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      cd.id,
      cd.case_id,
      cd.firm_id,
      cd.file_name,
      cd.mime_type,
      cd.size_bytes,
      cd.document_sha256,
      cd.storage_kind,
      cd.object_key,
      cd.file_bytes,
      cd.ocr_conversion_id,
      cd.uploaded_at,
      cd.created_at,
      cd.updated_at
    from public.case_documents cd
    inner join public.cases c on c.id = cd.case_id
    where cd.id = ${input.documentId}
      and c.user_id = ${input.userId}
    limit 1
  `;
  const [row] = rows as CaseDocumentRow[];

  if (!row || !row.file_bytes) {
    return null;
  }

  return {
    ...toCaseDocumentDto(row),
    bytes: byteaToUint8Array(row.file_bytes),
  };
}
