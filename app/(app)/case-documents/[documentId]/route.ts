import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/server/auth/current-user";
import { getCaseDocumentFileForUser } from "@/lib/server/documents/case-documents-repository";

function safeContentDispositionFileName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "");
}

export async function GET(
  _request: Request,
  context: RouteContext<"/case-documents/[documentId]">,
) {
  const { documentId } = await context.params;
  const user = await getCurrentUser();
  const documentFile = await getCaseDocumentFileForUser({
    documentId,
    userId: user.id,
  });

  if (!documentFile) {
    return NextResponse.json({ message: "Document not found." }, { status: 404 });
  }

  const body = new ArrayBuffer(documentFile.bytes.byteLength);
  new Uint8Array(body).set(documentFile.bytes);

  return new Response(body, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename="${safeContentDispositionFileName(documentFile.fileName)}"`,
      "Content-Length": String(documentFile.sizeBytes),
      "Content-Type": documentFile.mimeType,
    },
  });
}
