"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { updateCurrentUserCaseTitle } from "@/lib/server/cases/service";

const updateCaseTitleActionInputSchema = z.object({
  caseId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

export type UpdateCaseTitleActionResult =
  | {
      ok: true;
      title: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function updateCaseTitleAction(
  formData: FormData
): Promise<UpdateCaseTitleActionResult> {
  const parsedInput = updateCaseTitleActionInputSchema.safeParse({
    caseId: formData.get("caseId"),
    title: formData.get("title"),
  });

  if (!parsedInput.success) {
    return {
      ok: false,
      message: "Case names must be 1-120 characters.",
    };
  }

  const updatedCase = await updateCurrentUserCaseTitle(parsedInput.data);

  if (!updatedCase) {
    return {
      ok: false,
      message: "Case not found.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/case/${updatedCase.slug}`);

  return {
    ok: true,
    title: updatedCase.title,
  };
}
