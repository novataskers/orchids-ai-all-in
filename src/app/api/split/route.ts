import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink, readdir, rmdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";
import archiver from "archiver";
import { createWriteStream } from "fs";

const execAsync = promisify(exec);

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const UPLOAD_DIR = path.join(TMP_BASE, "uploads");
const OUTPUT_DIR = path.join(TMP_BASE, "outputs");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim());
  } catch {
    throw new Error("Failed to get video duration. Make sure FFmpeg and FFprobe are installed and available in the system PATH.");
  }
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

async function splitByHours(
  inputPath: string,
  outputDir: string,
  hours: number,
  baseName: string,
  ext: string
): Promise<string[]> {
  const duration = await getVideoDuration(inputPath);
  const segmentSeconds = hours * 3600;
  const outputs: string[] = [];
  let partNum = 1;
  let startTime = 0;

  while (startTime < duration) {
    const outputFile = path.join(outputDir, `${baseName}_part${partNum}${ext}`);
    const endTime = Math.min(startTime + segmentSeconds, duration);
    
    await execAsync(
      `ffmpeg -y -i "${inputPath}" -ss ${formatTime(startTime)} -to ${formatTime(endTime)} -c:v libx264 -c:a aac "${outputFile}"`
    );
    
    outputs.push(outputFile);
    startTime += segmentSeconds;
    partNum++;
  }

  return outputs;
}

async function splitByTimestamps(
  inputPath: string,
  outputDir: string,
  timestamps: string[],
  baseName: string,
  ext: string
): Promise<string[]> {
  const duration = await getVideoDuration(inputPath);
  const times = [0, ...timestamps.map(parseTimestamp).filter(t => t > 0), duration]
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t !== arr[i - 1]);
  
  const outputs: string[] = [];

  for (let i = 0; i < times.length - 1; i++) {
    const startTime = times[i];
    const endTime = times[i + 1];
    const outputFile = path.join(outputDir, `${baseName}_part${i + 1}${ext}`);

    await execAsync(
      `ffmpeg -y -i "${inputPath}" -ss ${formatTime(startTime)} -to ${formatTime(endTime)} -c:v libx264 -c:a aac "${outputFile}"`
    );

    outputs.push(outputFile);
  }

  return outputs;
}

async function createZip(files: string[], zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    for (const file of files) {
      archive.file(file, { name: path.basename(file) });
    }

    archive.finalize();
  });
}

async function cleanupAfterDelay(dirs: string[], delay: number = 300000) {
  setTimeout(async () => {
    for (const dir of dirs) {
      try {
        if (existsSync(dir)) {
          const files = await readdir(dir);
          for (const file of files) {
            await unlink(path.join(dir, file));
          }
          await rmdir(dir);
        }
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    }
  }, delay);
}

export async function POST(request: NextRequest) {
  // Check if FFmpeg is available
  try {
    await execAsync("ffmpeg -version");
  } catch {
    return NextResponse.json(
      { 
        error: "FFmpeg is not available on this system. Please install FFmpeg to use this tool." 
      },
      { status: 503 }
    );
  }

  const sessionId = uuidv4();
  const sessionUploadDir = path.join(UPLOAD_DIR, sessionId);
  const sessionOutputDir = path.join(OUTPUT_DIR, sessionId);

  try {
    await ensureDir(sessionUploadDir);
    await ensureDir(sessionOutputDir);

    const formData = await request.formData();
    const video = formData.get("video") as File | null;
    const mode = formData.get("mode") as string;
    const hours = formData.get("hours") as string | null;
    const timestamps = formData.get("timestamps") as string | null;

    if (!video) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const bytes = await video.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const originalName = video.name;
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const inputPath = path.join(sessionUploadDir, `input${ext}`);

    await writeFile(inputPath, buffer);

    let outputFiles: string[] = [];

    if (mode === "hours") {
      const hoursNum = parseFloat(hours || "1");
      if (isNaN(hoursNum) || hoursNum <= 0) {
        return NextResponse.json({ error: "Invalid hours value" }, { status: 400 });
      }
      outputFiles = await splitByHours(inputPath, sessionOutputDir, hoursNum, baseName, ext);
    } else if (mode === "timestamps") {
      const timestampList = (timestamps || "")
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      
      if (timestampList.length === 0) {
        return NextResponse.json({ error: "No timestamps provided" }, { status: 400 });
      }
      outputFiles = await splitByTimestamps(inputPath, sessionOutputDir, timestampList, baseName, ext);
    } else {
      return NextResponse.json({ error: "Invalid split mode" }, { status: 400 });
    }

    const zipPath = path.join(sessionOutputDir, `${baseName}_split.zip`);
    await createZip(outputFiles, zipPath);

    const files = outputFiles.map((f) => ({
      filename: path.basename(f),
      downloadUrl: `/api/download?session=${sessionId}&file=${encodeURIComponent(path.basename(f))}`,
    }));

    cleanupAfterDelay([sessionUploadDir, sessionOutputDir]);

    return NextResponse.json({
      success: true,
      files,
      zipUrl: `/api/download?session=${sessionId}&file=${encodeURIComponent(path.basename(zipPath))}`,
    });
  } catch (error) {
    console.error("Split error:", error);
    cleanupAfterDelay([sessionUploadDir, sessionOutputDir], 0);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process video" },
      { status: 500 }
    );
  }
}
