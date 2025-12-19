"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryState } from "nuqs";
import {
  FileItem,
  getFilesCache,
  appendToFilesCache,
  getThumbnail,
  setThumbnail,
} from "@/lib/cache";

const WORKER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://epstein-files.rhys-669.workers.dev";

interface FilesResponse {
  files: FileItem[];
  truncated: boolean;
  cursor: string | null;
  totalReturned: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

// PDF Thumbnail component - only loads when rendered (virtualized)
function PdfThumbnail({ fileKey }: { fileKey: string }) {
  const [thumbnail, setThumbnailState] = useState<string | null>(() => {
    return getThumbnail(fileKey) || null;
  });
  const [loading, setLoading] = useState(!getThumbnail(fileKey));

  useEffect(() => {
    if (getThumbnail(fileKey)) {
      setThumbnailState(getThumbnail(fileKey)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadThumbnail() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const fileUrl = `${WORKER_URL}/${fileKey}`;
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          disableAutoFetch: true,
          disableStream: true,
        });
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy();
          return;
        }

        const page = await pdf.getPage(1);
        const scale = 0.3;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise;

        if (!cancelled) {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          setThumbnail(fileKey, dataUrl);
          setThumbnailState(dataUrl);
        }

        page.cleanup();
        pdf.destroy();
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  return (
    <div className="h-32 bg-zinc-800 rounded-lg overflow-hidden">
      {loading && (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-600 border-t-zinc-300"></div>
        </div>
      )}

      {!loading && thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt="PDF thumbnail"
          className="w-full h-full object-cover object-top"
        />
      )}

      {!loading && !thumbnail && (
        <div className="flex items-center justify-center h-full">
          <svg
            className="w-12 h-12 text-red-500"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z" />
          </svg>
        </div>
      )}
    </div>
  );
}

// File card component
function FileCard({ file }: { file: FileItem }) {
  return (
    <Link
      href={`/file/${encodeURIComponent(file.key)}`}
      className="group bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all"
    >
      <div className="mb-3 group-hover:opacity-90 transition-opacity">
        <PdfThumbnail fileKey={file.key} />
      </div>

      <div className="space-y-1">
        <h3
          className="font-mono text-sm text-white truncate"
          title={getFileId(file.key)}
        >
          {getFileId(file.key)}
        </h3>
        <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
      </div>
    </Link>
  );
}

// Calculate columns based on container width
function useColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(5);

  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      if (width < 640) setColumns(1);
      else if (width < 768) setColumns(2);
      else if (width < 1024) setColumns(3);
      else if (width < 1280) setColumns(4);
      else setColumns(5);
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, [containerRef]);

  return columns;
}

export default function Home() {
  const cachedData = getFilesCache();
  const [files, setFiles] = useState<FileItem[]>(cachedData.files);
  const [loading, setLoading] = useState(cachedData.files.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(cachedData.cursor);
  const [hasMore, setHasMore] = useState(cachedData.hasMore);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(parentRef);

  const fetchFiles = useCallback(async (cursorParam?: string, prefix?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (cursorParam) params.set("cursor", cursorParam);
      if (prefix) params.set("prefix", prefix);

      const response = await fetch(`${WORKER_URL}/api/files?${params}`);
      if (!response.ok) throw new Error("Failed to fetch files");

      const data: FilesResponse = await response.json();

      if (cursorParam) {
        setFiles((prev) => {
          const existingKeys = new Set(prev.map((f) => f.key));
          const uniqueNewFiles = data.files.filter(
            (f) => !existingKeys.has(f.key)
          );
          if (!prefix) {
            appendToFilesCache(data.files, data.cursor, data.truncated);
          }
          return [...prev, ...uniqueNewFiles];
        });
      } else {
        setFiles(data.files);
        if (!prefix) {
          appendToFilesCache(data.files, data.cursor, data.truncated);
        }
      }

      setCursor(data.cursor);
      setHasMore(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch files on initial load (only for "All" collection)
  useEffect(() => {
    if (files.length === 0 && collectionFilter === "All") {
      fetchFiles();
    }
  }, [fetchFiles, files.length, collectionFilter]);

  // Refetch when collection filter changes
  useEffect(() => {
    const prefix = collectionFilter === "All" ? undefined : collectionFilter;
    if (collectionFilter === "All" && cachedData.files.length > 0) {
      // Use cached data for "All"
      setFiles(cachedData.files);
      setCursor(cachedData.cursor);
      setHasMore(cachedData.hasMore);
    } else {
      // Fetch fresh data for specific collection
      setFiles([]);
      setCursor(null);
      setHasMore(true);
      fetchFiles(undefined, prefix);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionFilter]);

  const filteredFiles = files.filter((file) => {
    // Search filter (client-side only, collection filter is server-side)
    if (!searchQuery) return true;
    const fileId = getFileId(file.key);
    return (
      fileId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Group files into rows for virtualization
  const rows: FileItem[][] = [];
  for (let i = 0; i < filteredFiles.length; i += columns) {
    rows.push(filteredFiles.slice(i, i + columns));
  }

  const virtualizer = useVirtualizer({
    count: rows.length + (hasMore ? 1 : 0), // +1 for load more trigger
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220, // Approximate row height
    overscan: 2,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Load more when we reach the end
  useEffect(() => {
    const lastItem = virtualRows[virtualRows.length - 1];
    if (!lastItem) return;

    // If we're showing the last row and there's more to load
    if (lastItem.index >= rows.length - 1 && hasMore && !loading && cursor) {
      const prefix = collectionFilter === "All" ? undefined : collectionFilter;
      fetchFiles(cursor, prefix);
    }
  }, [virtualRows, rows.length, hasMore, loading, cursor, fetchFiles, collectionFilter]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">
              Epstein Files Browser
            </h1>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label="View source on GitHub"
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>

          <div className="flex gap-4 items-center">
            <div>
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">VOL00001</option>
                <option value="VOL00002">VOL00002</option>
                <option value="VOL00003">VOL00003</option>
                <option value="VOL00004">VOL00004</option>
              </select>
            </div>
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by file ID (e.g., EFTA00000001)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="text-sm text-zinc-400">
              {files.length.toLocaleString()} files loaded
              {(searchQuery || collectionFilter !== "All") && ` (${filteredFiles.length} matching)`}
            </div>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Virtualized Grid */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const isLoaderRow = virtualRow.index >= rows.length;
              const row = rows[virtualRow.index];

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {isLoaderRow ? (
                    <div className="flex justify-center py-8">
                      {loading ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-white"></div>
                      ) : hasMore ? (
                        <button
                          onClick={() => cursor && fetchFiles(cursor, collectionFilter === "All" ? undefined : collectionFilter)}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
                        >
                          Load more
                        </button>
                      ) : (
                        <span className="text-zinc-500">
                          All {files.length.toLocaleString()} files loaded
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="grid gap-4"
                      style={{
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      }}
                    >
                      {row.map((file) => (
                        <FileCard key={file.key} file={file} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty states */}
          {!loading && files.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-500">No files found</p>
            </div>
          )}

          {!loading && files.length > 0 && filteredFiles.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-500">No files match your search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
