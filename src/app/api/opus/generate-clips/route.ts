import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, readdir, unlink, rmdir } from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";

const execAsync = promisify(exec);

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const OUTPUT_DIR = path.join(TMP_BASE, "opus-outputs");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type ClipInfo = {
  id: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  score: number;
};

function findEngagingClips(
  segments: TranscriptSegment[],
  clipDuration: number,
  maxClips: number
): ClipInfo[] {
  if (segments.length === 0) return [];

  const clips: ClipInfo[] = [];
  const totalDuration = segments[segments.length - 1].end;

  const engagementKeywords = [
    "secret", "amazing", "incredible", "shocking", "important", "key", "tip",
    "trick", "hack", "must", "need", "should", "best", "worst", "never", "always",
    "mistake", "success", "fail", "win", "lose", "money", "free", "easy", "hard",
    "simple", "quick", "fast", "how to", "why", "what if", "imagine", "think about",
    "listen", "watch", "look", "here's", "this is", "the truth", "actually",
    "believe", "crazy", "insane", "mind", "blow", "game changer", "life changing"
  ];

  const questionIndicators = ["?", "how", "why", "what", "when", "where", "who", "which"];
  const emotionalWords = ["love", "hate", "fear", "hope", "dream", "angry", "happy", "sad", "excited"];

  function scoreSegment(text: string): number {
    let score = 0;
    const lowerText = text.toLowerCase();

    for (const keyword of engagementKeywords) {
      if (lowerText.includes(keyword)) score += 2;
    }

    for (const q of questionIndicators) {
      if (lowerText.includes(q)) score += 1.5;
    }

    for (const emotion of emotionalWords) {
      if (lowerText.includes(emotion)) score += 1;
    }

    if (text.includes("!")) score += 0.5;

    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 50) score += 1;

    return score;
  }

  let currentStart = 0;
  while (currentStart < totalDuration) {
    const clipEnd = Math.min(currentStart + clipDuration, totalDuration);

    const clipSegments = segments.filter(
      (seg) => seg.start >= currentStart && seg.end <= clipEnd
    );

    if (clipSegments.length > 0) {
      const clipText = clipSegments.map((s) => s.text).join(" ");
      const score = scoreSegment(clipText);

      clips.push({
        id: clips.length,
        start: currentStart,
        end: clipEnd,
        duration: clipEnd - currentStart,
        text: clipText,
        score,
      });
    }

    currentStart += clipDuration * 0.75;
  }

  clips.sort((a, b) => b.score - a.score);

  const selectedClips: ClipInfo[] = [];
  for (const clip of clips) {
    if (selectedClips.length >= maxClips) break;

    const overlaps = selectedClips.some(
      (selected) =>
        (clip.start >= selected.start && clip.start < selected.end) ||
        (clip.end > selected.start && clip.end <= selected.end)
    );

    if (!overlaps) {
      selectedClips.push(clip);
    }
  }

  selectedClips.sort((a, b) => a.start - b.start);

  return selectedClips.map((clip, idx) => ({
    ...clip,
    id: idx + 1,
  }));
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

async function createClip(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  await execAsync(
    `ffmpeg -y -i "${inputPath}" -ss ${formatTime(startTime)} -to ${formatTime(endTime)} -c:v libx264 -c:a aac -preset fast "${outputPath}"`
  );
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

async function cleanupAfterDelay(dir: string, delay: number = 600000) {
  setTimeout(async () => {
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
  }, delay);
}

export async function POST(request: NextRequest) {
  try {
    await execAsync("ffmpeg -version");
  } catch {
    return NextResponse.json(
      { error: "FFmpeg is not available on this system" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      videoPath,
      segments,
      clipDuration = 60,
      maxClips = 5,
      aspectRatio = "9:16",
    } = body;

    if (!videoPath || !existsSync(videoPath)) {
      return NextResponse.json(
        { error: "Video file not found" },
        { status: 400 }
      );
    }

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: "No transcript segments provided" },
        { status: 400 }
      );
    }

    const sessionId = uuidv4();
    const sessionDir = path.join(OUTPUT_DIR, sessionId);
    await ensureDir(sessionDir);

    const engagingClips = findEngagingClips(segments, clipDuration, maxClips);

    if (engagingClips.length === 0) {
      return NextResponse.json(
        { error: "Could not find suitable clips in the video" },
        { status: 400 }
      );
    }

      const generatedClips: Array<{
        id: number;
        filename: string;
        downloadUrl: string;
        localPath: string;
        start: number;
        end: number;
        duration: number;
        text: string;
        score: number;
      }> = [];

      for (const clip of engagingClips) {
        const filename = `clip_${clip.id}_${Math.floor(clip.start)}s-${Math.floor(clip.end)}s.mp4`;
        const outputPath = path.join(sessionDir, filename);

        await createClip(videoPath, outputPath, clip.start, clip.end);

        generatedClips.push({
          id: clip.id,
          filename,
          downloadUrl: `/api/opus/file?session=${sessionId}&file=${encodeURIComponent(filename)}`,
          localPath: outputPath,
          start: clip.start,
          end: clip.end,
          duration: clip.duration,
          text: clip.text,
          score: clip.score,
        });
      }

    const clipFiles = generatedClips.map((c) =>
      path.join(sessionDir, c.filename)
    );
    const zipFilename = `opus_clips_${Date.now()}.zip`;
    const zipPath = path.join(sessionDir, zipFilename);
    await createZip(clipFiles, zipPath);

    cleanupAfterDelay(sessionDir);

    return NextResponse.json({
      success: true,
      sessionId,
      clips: generatedClips,
      zipUrl: `/api/opus/file?session=${sessionId}&file=${encodeURIComponent(zipFilename)}`,
      totalClips: generatedClips.length,
    });
  } catch (error) {
    console.error("Clip generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate clips" },
      { status: 500 }
    );
  }
}
