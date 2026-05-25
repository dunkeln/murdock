"use client";

import * as React from "react";

import type { IngestedFileItem } from "@/components/app/ingested-file-types";

type IngestedFilesContextValue = {
  includedFileIds: string[];
  files: IngestedFileItem[];
  onDeleteFile: (fileId: string) => void;
  onIncludedFileIdsChange: (fileIds: string[]) => void;
  onPreviewFile: (fileId: string | null) => void;
  previewedFile: File | null;
  previewedFileId: string | null;
};

const IngestedFilesContext =
  React.createContext<IngestedFilesContextValue | null>(null);

export function IngestedFilesProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: IngestedFilesContextValue;
}) {
  return (
    <IngestedFilesContext.Provider value={value}>
      {children}
    </IngestedFilesContext.Provider>
  );
}

export function useIngestedFiles() {
  const value = React.useContext(IngestedFilesContext);

  if (!value) {
    throw new Error("useIngestedFiles must be used inside AppFrame.");
  }

  return value;
}
