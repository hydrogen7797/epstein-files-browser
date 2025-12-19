"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  FileItem,
  getFilesCache,
  appendToFilesCache,
  getThumbnail,
  setThumbnail,
} from "@/lib/cache";

const WORKER_URL = process.env.NODE_ENV === "development" 
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

// Simple queue to limit concurrent PDF loads
class LoadQueue {
  private queue: (() => Promise<void>)[] = [];
  private running = 0;
  private maxConcurrent = 3;

  add(task: () => Promise<void>) {
    this.queue.push(task);
    this.process();
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    
    this.running++;
    const task = this.queue.shift()!;
    
    try {
      await task();
    } finally {
      this.running--;
      this.process();
    }
  }
}

const loadQueue = new LoadQueue();

// PDF Thumbnail component with lazy loading and caching
function PdfThumbnail({ fileKey }: { fileKey: string }) {
  const [thumbnail, setThumbnailState] = useState<string | null>(() => {
    return getThumbnail(fileKey) || null;
  });
  const [loading, setLoading] = useState(!getThumbnail(fileKey));
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Don't load if not visible or already have thumbnail
    if (!isVisible || getThumbnail(fileKey)) {
      if (getThumbnail(fileKey)) {
        setThumbnailState(getThumbnail(fileKey)!);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;

    const loadTask = async () => {
      if (cancelled) return;

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
        const scale = 0.3; // Smaller scale for thumbnails to save memory
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

        // Clean up
        page.cleanup();
        pdf.destroy();
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadQueue.add(loadTask);

    return () => {
      cancelled = true;
    };
  }, [fileKey, isVisible]);

  return (
    <div ref={containerRef} className="h-32 bg-zinc-800 rounded-lg overflow-hidden">
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

export default function Home() {
  const cachedData = getFilesCache();
  const [files, setFiles] = useState<FileItem[]>(cachedData.files);
  const [loading, setLoading] = useState(cachedData.files.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(cachedData.cursor);
  const [hasMore, setHasMore] = useState(cachedData.hasMore);
  const [searchQuery, setSearchQuery] = useState("");

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchFiles = useCallback(async (cursorParam?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursorParam) params.set("cursor", cursorParam);

      const response = await fetch(`${WORKER_URL}/api/files?${params}`);
      if (!response.ok) throw new Error("Failed to fetch files");

      const data: FilesResponse = await response.json();

      if (cursorParam) {
        setFiles((prev) => {
          const newFiles = [...prev, ...data.files];
          appendToFilesCache(data.files, data.cursor, data.truncated);
          return newFiles;
        });
      } else {
        setFiles(data.files);
        appendToFilesCache(data.files, data.cursor, data.truncated);
      }

      setCursor(data.cursor);
      setHasMore(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (files.length === 0) {
      fetchFiles();
    }
  }, [fetchFiles, files.length]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && cursor) {
          fetchFiles(cursor);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, cursor, fetchFiles]);

  const filteredFiles = files.filter((file) => {
    if (!searchQuery) return true;
    const fileId = getFileId(file.key);
    return (
      fileId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white mb-4">
            Epstein Files Browser
          </h1>

          <div className="flex gap-4 items-center">
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
              {searchQuery && ` (${filteredFiles.length} matching)`}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredFiles.map((file) => (
            <Link
              key={file.key}
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
                <p className="text-xs text-zinc-500">
                  {formatFileSize(file.size)}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div ref={loadMoreRef} className="h-20" />

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-white"></div>
          </div>
        )}

        {!hasMore && files.length > 0 && !loading && (
          <div className="text-center py-8 text-zinc-500">
            All {files.length.toLocaleString()} files loaded
          </div>
        )}

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
      </main>
    </div>
  );
}
