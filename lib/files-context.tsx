"use client";

import { createContext, useContext, ReactNode } from "react";
import { FileItem } from "./cache";

interface FilesContextValue {
  files: FileItem[];
  getFilePath: (fileId: string) => string | null;
  getAdjacentFile: (currentPath: string, offset: number) => string | null;
}

const FilesContext = createContext<FilesContextValue | null>(null);

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

export function FilesProvider({
  children,
  files,
}: {
  children: ReactNode;
  files: FileItem[];
}) {
  // Create a sorted list of file paths for navigation
  const sortedFiles = [...files].sort((a, b) => {
    const idA = getFileId(a.key);
    const idB = getFileId(b.key);
    return idA.localeCompare(idB);
  });

  // Create a map from file ID to full path for quick lookup
  const fileIdToPath = new Map<string, string>();
  sortedFiles.forEach((file) => {
    const id = getFileId(file.key);
    fileIdToPath.set(id, file.key);
  });

  // Get the full file path for a given file ID
  const getFilePath = (fileId: string): string | null => {
    return fileIdToPath.get(fileId) ?? null;
  };

  // Get adjacent file path (prev/next)
  const getAdjacentFile = (currentPath: string, offset: number): string | null => {
    const currentIndex = sortedFiles.findIndex((f) => f.key === currentPath);
    if (currentIndex === -1) return null;

    const newIndex = currentIndex + offset;
    if (newIndex < 0 || newIndex >= sortedFiles.length) return null;

    return sortedFiles[newIndex].key;
  };

  return (
    <FilesContext.Provider value={{ files: sortedFiles, getFilePath, getAdjacentFile }}>
      {children}
    </FilesContext.Provider>
  );
}

export function useFiles() {
  const context = useContext(FilesContext);
  if (!context) {
    throw new Error("useFiles must be used within a FilesProvider");
  }
  return context;
}

// Optional hook that doesn't throw if context is missing
export function useFilesOptional() {
  return useContext(FilesContext);
}
