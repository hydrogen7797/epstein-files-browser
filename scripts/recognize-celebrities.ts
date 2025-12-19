import {
  RekognitionClient,
  RecognizeCelebritiesCommand,
} from "@aws-sdk/client-rekognition";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Initialize Rekognition client
const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
});

interface CelebrityMatch {
  name: string;
  confidence: number;
  urls: string[];
}

interface PageResult {
  file: string;
  page: number;
  totalPages: number;
  celebrities: CelebrityMatch[];
  error?: string;
}

interface ProcessingResults {
  processedAt: string;
  totalImages: number;
  imagesWithCelebrities: number;
  uniqueCelebrities: string[];
  // Map of celebrity name -> list of appearances
  celebrityAppearances: Record<string, { file: string; page: number; confidence: number }[]>;
  results: PageResult[];
}

function getPageCount(pdfPath: string): number {
  try {
    const pdfInfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: "utf-8" });
    const match = pdfInfo.match(/Pages:\s+(\d+)/);
    return match ? parseInt(match[1]) : 1;
  } catch {
    return 1;
  }
}

async function recognizeCelebrities(
  imageBuffer: Buffer
): Promise<CelebrityMatch[]> {
  try {
    const command = new RecognizeCelebritiesCommand({
      Image: { Bytes: imageBuffer },
    });

    const response = await rekognition.send(command);
    const celebrities: CelebrityMatch[] = [];

    if (response.CelebrityFaces) {
      for (const celeb of response.CelebrityFaces) {
        if (celeb.Name && celeb.MatchConfidence) {
          celebrities.push({
            name: celeb.Name,
            confidence: celeb.MatchConfidence,
            urls: celeb.Urls || [],
          });
        }
      }
    }

    return celebrities;
  } catch (error) {
    if ((error as Error).name === "ThrottlingException") {
      console.log(" [rate limited, waiting...]");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return recognizeCelebrities(imageBuffer);
    }
    throw error;
  }
}

async function processPage(
  pdfPath: string,
  page: number,
  totalPages: number
): Promise<PageResult> {
  const result: PageResult = {
    file: pdfPath,
    page,
    totalPages,
    celebrities: [],
  };

  const tempFile = `/tmp/pdf-page-${Date.now()}-${page}.png`;

  try {
    // Convert single page at lower res to handle large files
    execSync(
      `pdftoppm -png -r 100 -f ${page} -l ${page} -singlefile "${pdfPath}" "${tempFile.replace(".png", "")}"`,
      { stdio: "pipe" }
    );

    const imageBuffer = fs.readFileSync(tempFile);
    result.celebrities = await recognizeCelebrities(imageBuffer);

    fs.unlinkSync(tempFile);
  } catch (error) {
    result.error = (error as Error).message;
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }

  return result;
}

async function findPdfFiles(dir: string): Promise<string[]> {
  const pdfFiles: string[] = [];

  function walkDir(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
        pdfFiles.push(fullPath);
      }
    }
  }

  walkDir(dir);
  return pdfFiles.sort();
}

async function main() {
  const filesDir = path.join(process.cwd(), "files");
  const limit = parseInt(process.argv[2] || "0") || Infinity;

  // Check for pdftoppm
  try {
    execSync("which pdftoppm", { stdio: "pipe" });
  } catch {
    console.error("Error: pdftoppm not found. Install with: brew install poppler");
    process.exit(1);
  }

  console.log("Finding PDF files...");
  const pdfFiles = await findPdfFiles(filesDir);
  console.log(`Found ${pdfFiles.length} PDF files\n`);

  const outputPath = path.join(process.cwd(), "celebrity-results.json");

  // Load existing results for resume capability
  let processedKeys = new Set<string>();
  let existingResults: PageResult[] = [];

  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as ProcessingResults;
      existingResults = existing.results;
      processedKeys = new Set(existing.results.map((r) => `${r.file}:${r.page}`));
      console.log(`Resuming (${existingResults.length} pages already processed)\n`);
    } catch {
      console.log("Starting fresh...\n");
    }
  }

  const results: PageResult[] = [...existingResults];
  let filesProcessed = 0;
  let imagesProcessed = existingResults.length;

  for (const pdfPath of pdfFiles) {
    if (filesProcessed >= limit) break;

    const pageCount = getPageCount(pdfPath);
    // Check if all pages of this file are already processed
    let allPagesProcessed = true;
    for (let page = 1; page <= pageCount; page++) {
      if (!processedKeys.has(`${pdfPath}:${page}`)) {
        allPagesProcessed = false;
        break;
      }
    }

    if (allPagesProcessed) continue;

    filesProcessed++;
    console.log(`[${filesProcessed}/${Math.min(limit, pdfFiles.length)}] ${path.basename(pdfPath)} (${pageCount} pages)`);

    for (let page = 1; page <= pageCount; page++) {
      const key = `${pdfPath}:${page}`;
      if (processedKeys.has(key)) continue;

      process.stdout.write(`  Page ${page}/${pageCount}...`);

      const pageResult = await processPage(pdfPath, page, pageCount);
      results.push(pageResult);
      processedKeys.add(key);
      imagesProcessed++;

      if (pageResult.celebrities.length > 0) {
        console.log(` Found: ${pageResult.celebrities.map((c) => c.name).join(", ")}`);
      } else {
        console.log(" -");
      }

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Save after each file
    saveResults(outputPath, results);
  }

  // Final save
  saveResults(outputPath, results);

  // Summary
  const uniqueCelebs = new Set<string>();
  for (const r of results) {
    for (const c of r.celebrities) {
      uniqueCelebs.add(c.name);
    }
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Total images processed: ${results.length}`);
  console.log(`Images with celebrities: ${results.filter((r) => r.celebrities.length > 0).length}`);
  console.log(`Unique celebrities: ${uniqueCelebs.size}`);
  console.log(`\nResults saved to: celebrity-results.json`);
  console.log(`Estimated cost: $${(results.length * 0.001).toFixed(2)}`);
}

function saveResults(outputPath: string, results: PageResult[]) {
  const uniqueCelebrities = new Set<string>();
  const celebrityAppearances: Record<string, { file: string; page: number; confidence: number }[]> = {};

  for (const r of results) {
    for (const c of r.celebrities) {
      uniqueCelebrities.add(c.name);
      if (!celebrityAppearances[c.name]) {
        celebrityAppearances[c.name] = [];
      }
      celebrityAppearances[c.name].push({
        file: r.file,
        page: r.page,
        confidence: c.confidence,
      });
    }
  }

  // Sort appearances by confidence
  for (const name of Object.keys(celebrityAppearances)) {
    celebrityAppearances[name].sort((a, b) => b.confidence - a.confidence);
  }

  const output: ProcessingResults = {
    processedAt: new Date().toISOString(),
    totalImages: results.length,
    imagesWithCelebrities: results.filter((r) => r.celebrities.length > 0).length,
    uniqueCelebrities: Array.from(uniqueCelebrities).sort(),
    celebrityAppearances,
    results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

main().catch(console.error);
