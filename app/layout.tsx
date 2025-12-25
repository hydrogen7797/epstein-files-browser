import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Analytics } from "@vercel/analytics/next";
import { FilesProvider } from "@/lib/files-context";
import { FileItem, PdfManifest } from "@/lib/cache";
import "./globals.css";

// Optimize font loading with display swap for better performance
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Epstein Files Browser",
  description: "Browse and view the released Epstein files",
};

const WORKER_URL = "https://epstein-files.rhys-669.workers.dev";

interface AllFilesResponse {
  files: FileItem[];
  totalReturned: number;
}

async function fetchAllFiles(): Promise<FileItem[]> {
  const response = await fetch(`${WORKER_URL}/api/all-files`, {
    next: { revalidate: 3600 }, // Revalidate every hour
  });

  if (!response.ok) {
    throw new Error("Failed to fetch files");
  }

  const data: AllFilesResponse = await response.json();
  return data.files;
}

async function fetchPdfManifest(): Promise<PdfManifest> {
  try {
    const response = await fetch(`${WORKER_URL}/api/pdf-manifest`, {
      next: { revalidate: 3600 }, // Revalidate every hour
    });

    if (!response.ok) {
      console.warn("PDF manifest not available, falling back to PDF rendering");
      return {};
    }

    return await response.json();
  } catch {
    console.warn("Failed to fetch PDF manifest, falling back to PDF rendering");
    return {};
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [files, pdfManifest] = await Promise.all([
    fetchAllFiles(),
    fetchPdfManifest(),
  ]);

  const workerUrl = "https://epstein-files.rhys-669.workers.dev";

  return (
    <html lang="en">
      <head>
        {/* Resource hints for better performance */}
        <link rel="preconnect" href={workerUrl} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={workerUrl} />
        {/* Preconnect to CDN for PDF.js worker */}
        <link rel="preconnect" href="https://unpkg.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FilesProvider files={files} pdfManifest={pdfManifest}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </FilesProvider>
        <Analytics />
      </body>
    </html>
  );
}
