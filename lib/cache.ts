export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
}

interface FilesCache {
  files: FileItem[];
  cursor: string | null;
  hasMore: boolean;
}

// Global cache for files list
let filesCache: FilesCache = {
  files: [],
  cursor: null,
  hasMore: true,
};

export function getFilesCache(): FilesCache {
  return filesCache;
}

export function setFilesCache(data: FilesCache): void {
  filesCache = data;
}

export function appendToFilesCache(newFiles: FileItem[], cursor: string | null, hasMore: boolean): void {
  filesCache = {
    files: [...filesCache.files, ...newFiles],
    cursor,
    hasMore,
  };
}

// Global cache for PDF thumbnails (first page renders)
const thumbnailCache = new Map<string, string>();

export function getThumbnail(key: string): string | undefined {
  return thumbnailCache.get(key);
}

export function setThumbnail(key: string, dataUrl: string): void {
  thumbnailCache.set(key, dataUrl);
}

// Global cache for full PDF page renders
const pdfPagesCache = new Map<string, string[]>();

export function getPdfPages(key: string): string[] | undefined {
  return pdfPagesCache.get(key);
}

export function setPdfPages(key: string, pages: string[]): void {
  pdfPagesCache.set(key, pages);
}
