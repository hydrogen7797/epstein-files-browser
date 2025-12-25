"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueryState } from "nuqs";
import { FileItem, getPdfPages, setPdfPages, getPdfManifest } from "@/lib/cache";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getCelebritiesAboveConfidence,
  getFilesForCelebrity,
  CELEBRITY_DATA,
} from "@/lib/celebrity-data";
import { CelebrityCombobox } from "@/components/celebrity-combobox";
import { CelebrityDisclaimer } from "@/components/celebrity-disclaimer";
import { useFiles } from "@/lib/files-context";

const WORKER_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://epstein-files.rhys-669.workers.dev";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFileId(key: string): string {
  const match = key.match(/EFTA\d+/);
  return match ? match[0] : key;
}

// Thumbnail component - loads thumbnail from R2 with skeleton loading
function Thumbnail({ fileKey }: { fileKey: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const thumbnailUrl = `${WORKER_URL}/thumbnails/${fileKey.replace(".pdf", ".jpg")}`;

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br from-secondary via-secondary/80 to-secondary/60">
      {isLoading && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-secondary/50 via-accent/20 to-secondary/50" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt="Document thumbnail"
        className={cn(
          "aspect-[3/4] w-full object-cover object-top transition-all duration-500",
          isLoading ? "opacity-0 scale-105" : "opacity-100 scale-100",
          hasError && "hidden"
        )}
        loading="lazy"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-4">
            <svg className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs text-muted-foreground">Preview unavailable</p>
          </div>
        </div>
      )}
    </div>
  );
}

// File card component with enhanced UI
function FileCard({ file, onClick, onMouseEnter }: { file: FileItem; onClick: () => void; onMouseEnter?: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group relative text-left w-full transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background rounded-2xl"
    >
      <div className="relative mb-3 overflow-hidden rounded-xl shadow-lg shadow-black/10 group-hover:shadow-xl group-hover:shadow-primary/10 transition-all duration-300">
        <Thumbnail fileKey={file.key} />
        {/* Enhanced hover overlay with metadata */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white/95">
              <div className="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-xs font-medium">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">{formatDate(file.uploaded)}</span>
            </div>
          </div>
        </div>
        {/* Enhanced hover indicator */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
          <div className="w-8 h-8 rounded-full bg-white/25 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
        {/* Shine effect on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
      </div>

      <div className="space-y-1 px-1">
        <h3
          className="font-mono text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-200"
          title={getFileId(file.key)}
        >
          {getFileId(file.key)}
        </h3>
        <div className="h-0.5 w-0 bg-primary group-hover:w-full transition-all duration-300 rounded-full" />
      </div>
    </button>
  );
}

// Get celebrities for a specific file and page
function getCelebritiesForPage(filePath: string, pageNumber: number): { name: string; confidence: number }[] {
  const celebrities: { name: string; confidence: number }[] = [];
  
  for (const celebrity of CELEBRITY_DATA) {
    for (const appearance of celebrity.appearances) {
      if (appearance.file === filePath && appearance.page === pageNumber) {
        celebrities.push({
          name: celebrity.name,
          confidence: appearance.confidence
        });
      }
    }
  }
  
  return celebrities.sort((a, b) => b.confidence - a.confidence).filter(celeb => celeb.confidence > 99);
}

// Track in-progress prefetch operations to avoid duplicates
const prefetchingSet = new Set<string>();

// Get the image URL for a specific PDF page
function getPageImageUrl(pdfKey: string, pageNum: number): string {
  const basePath = pdfKey.replace(".pdf", "");
  const pageStr = String(pageNum).padStart(3, "0");
  return `${WORKER_URL}/pdfs-as-jpegs/${basePath}/page-${pageStr}.jpg`;
}

// Load pages from pre-rendered images
async function loadPagesFromImages(filePath: string, pageCount: number): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    urls.push(getPageImageUrl(filePath, i));
  }
  return urls;
}

// Prefetch PDF pages in the background (uses pre-rendered images if available)
async function prefetchPdf(filePath: string): Promise<void> {
  if (getPdfPages(filePath) || prefetchingSet.has(filePath)) return;
  
  prefetchingSet.add(filePath);
  
  try {
    const manifest = getPdfManifest();
    const manifestEntry = manifest?.[filePath];
    
    // If we have pre-rendered images in the manifest, use those
    if (manifestEntry && manifestEntry.pages > 0) {
      const imageUrls = await loadPagesFromImages(filePath, manifestEntry.pages);
      
      // Prefetch the images by creating Image objects
      await Promise.all(
        imageUrls.map((url) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Still resolve on error
            img.src = url;
          });
        })
      );
      
      setPdfPages(filePath, imageUrls);
      return;
    }
    
    // Fallback to client-side PDF rendering if no pre-rendered images
    const fileUrl = `${WORKER_URL}/${filePath}`;
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const loadingTask = pdfjsLib.getDocument(fileUrl);
    const pdf = await loadingTask.promise;

    const renderedPages: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const scale = 2;
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

      renderedPages.push(canvas.toDataURL("image/jpeg", 0.85));
    }

    if (renderedPages.length > 0) {
      setPdfPages(filePath, renderedPages);
    }
  } catch {
    // Silently fail prefetch
  } finally {
    prefetchingSet.delete(filePath);
  }
}

// Share popover component
function SharePopover({ filePath, queryString }: { filePath: string; queryString: string }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/file/${encodeURIComponent(filePath)}${queryString}`
    : `/file/${encodeURIComponent(filePath)}${queryString}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 sm:px-4 sm:py-2 bg-gradient-to-r from-secondary/90 to-secondary/80 hover:from-secondary hover:to-secondary/90 border border-border/50 rounded-xl text-sm font-medium flex items-center gap-2 transition-all duration-200 hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="hidden sm:inline">Share</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 bg-gradient-to-br from-card via-card/95 to-card border border-border/50 rounded-2xl shadow-2xl" align="end">
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border/50">
            <div className="p-2 rounded-lg bg-primary/10">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-foreground">Share this document</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-3 py-2.5 text-xs bg-secondary/80 border border-border/50 rounded-xl text-foreground truncate focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all duration-200",
                copied 
                  ? "bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-400 border border-green-500/30 shadow-lg shadow-green-500/10" 
                  : "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-105"
              )}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Modal component for viewing files
function FileModal({ 
  file, 
  onClose, 
  onPrev, 
  onNext,
  hasPrev,
  hasNext,
  queryString,
  nextFiles
}: { 
  file: FileItem; 
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  queryString: string;
  nextFiles: FileItem[];
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  
  const filePath = file.key;
  const fileId = getFileId(filePath);
  const fileUrl = `${WORKER_URL}/${filePath}`;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        onNext();
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  // Touch/swipe navigation for mobile
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const swipeThreshold = 50;
    
    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
      if (deltaX > 0 && hasPrev) {
        onPrev();
      } else if (deltaX < 0 && hasNext) {
        onNext();
      }
    }
    
    touchStartRef.current = null;
  }, [hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown, handleTouchStart, handleTouchEnd]);

  // Load PDF pages (uses pre-rendered images if available, falls back to PDF rendering)
  useEffect(() => {
    // Always reset state immediately when file changes
    setError(null);
    
    const cached = getPdfPages(filePath);
    
    if (cached && cached.length > 0) {
      setPages(cached);
      setLoading(false);
      return;
    }

    // Clear old pages immediately and show loading
    setPages([]);
    setLoading(true);

    let cancelled = false;

    async function loadPages() {
      try {
        const manifest = getPdfManifest();
        const manifestEntry = manifest?.[filePath];
        
        // If we have pre-rendered images in the manifest, use those
        if (manifestEntry && manifestEntry.pages > 0) {
          const imageUrls = await loadPagesFromImages(filePath, manifestEntry.pages);
          
          if (cancelled) return;
          
          // Set URLs directly - browser will load them
          setPages(imageUrls);
          setPdfPages(filePath, imageUrls);
          setLoading(false);
          return;
        }
        
        // Fallback to client-side PDF rendering
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const renderedPages: string[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNum);
          const scale = 2;
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

          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          renderedPages.push(dataUrl);

          setPages([...renderedPages]);
        }

        if (!cancelled && renderedPages.length > 0) {
          setPdfPages(filePath, renderedPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPages();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, filePath]);
  
  // Prefetch next PDFs - use file keys as dependency to avoid array reference issues
  const nextFileKeys = nextFiles.map(f => f.key).join(',');
  useEffect(() => {
    if (loading || !nextFileKeys) return;
    
    const keys = nextFileKeys.split(',').filter(Boolean);
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    
    // Prefetch next 5 files with staggered delays
    keys.forEach((key, index) => {
      const timeoutId = setTimeout(() => {
        prefetchPdf(key);
      }, index * 100);
      timeoutIds.push(timeoutId);
    });
    
    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [loading, nextFileKeys]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
      {/* Enhanced backdrop with gradient */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-background/98 via-background/95 to-background/98 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal content with enhanced styling */}
      <div className="relative w-full h-full flex flex-col animate-in zoom-in-95 duration-300">
        {/* Enhanced header with gradient */}
        <header className="flex-shrink-0 border-b border-border/50 bg-gradient-to-r from-card/95 via-card/90 to-card/95 backdrop-blur-xl z-10 shadow-lg shadow-black/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-secondary/80 hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0 transition-all duration-200 hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h1 className="text-base sm:text-lg font-mono font-semibold text-foreground truncate bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">{fileId}</h1>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <SharePopover filePath={filePath} queryString={queryString} />
              <a
                href={fileUrl}
                download
                className="p-2 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Download</span>
              </a>
            </div>
          </div>
        </header>

        {/* Content - key forces remount on file change for clean transition */}
        <div key={filePath} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24" onClick={onClose}>
          {error && (
            <div className="max-w-3xl mx-auto bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-2xl mb-6 flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Error loading PDF</p>
                <p className="text-sm text-destructive/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-6">
            {pages.map((dataUrl, index) => {
              const pageCelebrities = getCelebritiesForPage(filePath, index + 1);
              return (
                <div key={`${filePath}-${index}`} className="bg-card rounded-2xl shadow-xl overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
                  <div className="relative">
                    {pages.length > 1 && (
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-background/80 backdrop-blur-sm rounded-lg text-xs font-medium text-muted-foreground border border-border">
                        Page {index + 1}
                      </div>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt={`Page ${index + 1}`}
                      className="w-full h-auto md:max-h-[75vh] md:w-auto md:mx-auto"
                      style={{ maxWidth: "100%" }}
                    />
                  </div>
                  {pageCelebrities.length > 0 && (
                    <div className="bg-gradient-to-br from-secondary/60 via-secondary/40 to-secondary/60 border-t border-border/50 px-6 py-5 backdrop-blur-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-foreground">Detected in this image:</p>
                      </div>
                      <div className="flex flex-wrap gap-2.5 mb-4">
                        {pageCelebrities.map((celeb, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-gradient-to-r from-card to-card/80 border border-border/50 text-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 hover:border-primary/30"
                          >
                            <span className="font-semibold">{celeb.name}</span>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">({Math.round(celeb.confidence)}%)</span>
                          </span>
                        ))}
                      </div>
                      <CelebrityDisclaimer />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-secondary/30"></div>
                <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                <div className="absolute inset-2 w-12 h-12 rounded-full border-2 border-primary/30 border-r-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-foreground font-semibold text-lg">Loading PDF...</p>
                <p className="text-muted-foreground text-sm">Preparing document for viewing</p>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced navigation bar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-2.5 bg-gradient-to-r from-card/95 via-card/90 to-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/20 z-20 animate-in slide-in-from-bottom-4 duration-300">
          {hasPrev ? (
            <button
              onClick={onPrev}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-primary hover:bg-gradient-to-r hover:from-secondary/80 hover:to-secondary/60 rounded-xl transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <kbd className="px-2.5 py-1 bg-secondary/80 rounded-lg font-mono text-xs font-bold text-foreground border border-border/50 shadow-sm">←</kbd>
              <span>Prev</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground/40 cursor-not-allowed">
              <kbd className="px-2.5 py-1 bg-secondary/30 rounded-lg font-mono text-xs text-muted-foreground/30">←</kbd>
              <span>Prev</span>
            </div>
          )}
          <div className="w-px h-6 bg-border/50 mx-1"></div>
          {hasNext ? (
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-primary hover:bg-gradient-to-r hover:from-secondary/80 hover:to-secondary/60 rounded-xl transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <span>Next</span>
              <kbd className="px-2.5 py-1 bg-secondary/80 rounded-lg font-mono text-xs font-bold text-foreground border border-border/50 shadow-sm">→</kbd>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground/40 cursor-not-allowed">
              <span>Next</span>
              <kbd className="px-2.5 py-1 bg-secondary/30 rounded-lg font-mono text-xs text-muted-foreground/30">→</kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileBrowser() {
  const { files: initialFiles } = useFiles();

  const [collectionFilter, setCollectionFilter] = useQueryState("collection", {
    defaultValue: "All",
  });
  const [celebrityFilter, setCelebrityFilter] = useQueryState("celebrity", {
    defaultValue: "All",
  });
  const [sortBy, setSortBy] = useQueryState("sort", {
    defaultValue: "name",
  });
  const [openFile, setOpenFile] = useQueryState("file");

  // Get celebrities with >99% confidence for the dropdown
  const celebrities = getCelebritiesAboveConfidence(99);

  // Derive filtered and sorted files from initialFiles + filters
  const filteredFiles = useMemo(() => {
    let files = initialFiles;

    // Apply collection filter
    if (collectionFilter !== "All") {
      files = files.filter((f) => f.key.startsWith(collectionFilter));
    }

    // Apply celebrity filter
    if (celebrityFilter !== "All") {
      const celebrityFileKeys = new Set(getFilesForCelebrity(celebrityFilter, 99));
      files = files.filter((f) => celebrityFileKeys.has(f.key));
    }

    // Apply sorting
    files = [...files].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime();
        case "date-asc":
          return new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime();
        case "size-desc":
          return b.size - a.size;
        case "size-asc":
          return a.size - b.size;
        case "name":
        default:
          return getFileId(a.key).localeCompare(getFileId(b.key));
      }
    });

    return files;
  }, [initialFiles, collectionFilter, celebrityFilter, sortBy]);

  // Build query string to preserve filters in file links
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (collectionFilter !== "All") params.set("collection", collectionFilter);
    if (celebrityFilter !== "All") params.set("celebrity", celebrityFilter);
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [collectionFilter, celebrityFilter]);
  
  // Modal state - find index from file key
  const selectedFileIndex = useMemo(() => {
    if (!openFile) return null;
    const index = filteredFiles.findIndex(f => f.key === openFile);
    return index >= 0 ? index : null;
  }, [openFile, filteredFiles]);
  
  const selectedFile = selectedFileIndex !== null ? filteredFiles[selectedFileIndex] : null;
  const hasPrev = selectedFileIndex !== null && selectedFileIndex > 0;
  const hasNext = selectedFileIndex !== null && selectedFileIndex < filteredFiles.length - 1;
  
  const handlePrev = useCallback(() => {
    if (selectedFileIndex !== null && selectedFileIndex > 0) {
      setOpenFile(filteredFiles[selectedFileIndex - 1].key);
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile]);
  
  const handleNext = useCallback(() => {
    if (selectedFileIndex !== null && selectedFileIndex < filteredFiles.length - 1) {
      setOpenFile(filteredFiles[selectedFileIndex + 1].key);
    }
  }, [selectedFileIndex, filteredFiles, setOpenFile]);
  
  const handleClose = useCallback(() => {
    setOpenFile(null);
  }, [setOpenFile]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-background/95 text-foreground">
      {/* Enhanced Header with gradient */}
      <header className="border-b border-border/50 bg-gradient-to-r from-card/95 via-card/90 to-card/95 backdrop-blur-xl sticky top-0 z-10 shadow-lg shadow-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent tracking-tight">
                  Epstein Files Browser
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Browse and explore released documents</p>
              </div>
            </div>
            <a
              href="https://github.com/RhysSullivan/epstein-files-browser"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl bg-secondary/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 hover:shadow-lg border border-border/50 hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="View source on GitHub"
            >
              <svg
                className="w-5 h-5"
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

          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative">
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-secondary border border-border rounded-xl text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer hover:bg-accent"
              >
                <option value="All">All Collections</option>
                <option value="VOL00001">Volume 1</option>
                <option value="VOL00002">Volume 2</option>
                <option value="VOL00003">Volume 3</option>
                <option value="VOL00004">Volume 4</option>
                <option value="VOL00005">Volume 5</option>
                <option value="VOL00006">Volume 6</option>
                <option value="VOL00007">Volume 7</option>
                <option value="VOL00008">Volume 8</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <CelebrityCombobox
              celebrities={celebrities}
              value={celebrityFilter}
              onValueChange={(value) => setCelebrityFilter(value)}
            />

            <div className="relative group">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-gradient-to-r from-secondary/90 to-secondary/80 border border-border/50 rounded-xl text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200 cursor-pointer hover:from-secondary hover:to-secondary/90 hover:border-border hover:shadow-md"
              >
                <option value="name">Sort by Name</option>
                <option value="size-desc">Largest First</option>
                <option value="size-asc">Smallest First</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl backdrop-blur-sm">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-foreground">
                <span className="text-primary">{filteredFiles.length.toLocaleString()}</span> files
                {collectionFilter !== "All" || celebrityFilter !== "All"
                  ? <span className="text-muted-foreground font-normal"> / {initialFiles.length.toLocaleString()}</span>
                  : ""}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Celebrity Detection Disclaimer */}
      {celebrityFilter !== "All" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-5 py-4 rounded-2xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <CelebrityDisclaimer className="text-amber-200/90 [&_a]:text-amber-300 [&_a]:hover:text-amber-100" />
                <p className="text-sm mt-1.5 text-amber-200/70">
                  Results limited to {">"}99% confidence matches from AWS Rekognition.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced File Grid with staggered animations */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filteredFiles.map((file, index) => (
            <div
              key={file.key}
              className="animate-fade-in-up"
              style={{
                animationDelay: `${Math.min(index * 30, 300)}ms`,
                animationFillMode: 'both'
              }}
            >
              <FileCard 
                file={file} 
                onClick={() => setOpenFile(file.key)} 
                onMouseEnter={() => prefetchPdf(file.key)}
              />
            </div>
          ))}
        </div>

        {/* Enhanced empty state */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-secondary/60 via-secondary/40 to-secondary/60 flex items-center justify-center border border-border/50 shadow-xl">
                <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary/20 rounded-full animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">No files found</h3>
            <p className="text-muted-foreground text-sm max-w-md">Try adjusting your filters to find what you&apos;re looking for.</p>
            <div className="mt-6 flex gap-2">
              {(collectionFilter !== "All" || celebrityFilter !== "All") && (
                <button
                  onClick={() => {
                    setCollectionFilter("All");
                    setCelebrityFilter("All");
                  }}
                  className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105 border border-primary/20"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* File Modal */}
      {selectedFile && (
        <FileModal
          file={selectedFile}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
          hasPrev={hasPrev}
          hasNext={hasNext}
          queryString={queryString}
          nextFiles={selectedFileIndex !== null ? filteredFiles.slice(selectedFileIndex + 1, selectedFileIndex + 6) : []}
        />
      )}
    </div>
  );
}
