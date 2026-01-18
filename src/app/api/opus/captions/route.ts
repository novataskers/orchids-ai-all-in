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
const OUTPUT_DIR = path.join(TMP_BASE, "opus-captioned");

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

type CaptionStyle = {
  fontName: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: "bottom" | "center" | "top";
  bold: boolean;
  outline: number;
  shadow: number;
};

function generateSRT(segments: TranscriptSegment[], clipStart: number): string {
  let srt = "";
  let counter = 1;

  for (const segment of segments) {
    const relativeStart = segment.start - clipStart;
    const relativeEnd = segment.end - clipStart;

    if (relativeStart < 0 || relativeEnd < 0) continue;

    const startTime = formatSRTTime(relativeStart);
    const endTime = formatSRTTime(relativeEnd);

    srt += `${counter}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${segment.text}\n\n`;
    counter++;
  }

  return srt;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function generateASS(
  segments: TranscriptSegment[],
  clipStart: number,
  style: CaptionStyle,
  videoWidth: number = 1080,
  videoHeight: number = 1920
): string {
  const positionY = style.position === "bottom" ? videoHeight - 150 : style.position === "top" ? 150 : videoHeight / 2;

  let ass = `[Script Info]
Title: Opus Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${hexToASS(style.fontColor)},&H000000FF,&H00000000,${hexToASS(style.backgroundColor)},${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,${style.outline},${style.shadow},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const segment of segments) {
    const relativeStart = segment.start - clipStart;
    const relativeEnd = segment.end - clipStart;

    if (relativeStart < 0 || relativeEnd < 0) continue;

    const startTime = formatASSTime(relativeStart);
    const endTime = formatASSTime(relativeEnd);

    const words = segment.text.split(/\s+/);
    const highlightedText = words.map((word) => `{\\c&HFFFFFF&}${word}`).join(" ");

    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\pos(${videoWidth / 2},${positionY})}${highlightedText}\n`;
  }

  return ass;
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function hexToASS(hex: string): string {
  const cleanHex = hex.replace("#", "");
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

async function burnCaptions(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  aspectRatio: string = "9:16"
): Promise<void> {
  let filterComplex: string;

  if (aspectRatio === "9:16") {
    filterComplex = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,ass='${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;
  } else if (aspectRatio === "1:1") {
    filterComplex = `scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2,ass='${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;
  } else {
    filterComplex = `ass='${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;
  }

  await execAsync(
    `ffmpeg -y -i "${inputPath}" -vf "${filterComplex}" -c:v libx264 -c:a aac -preset fast "${outputPath}"`
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
      clips,
      segments,
      captionStyle = {
        fontName: "Arial",
        fontSize: 48,
        fontColor: "#FFFFFF",
        backgroundColor: "#00000080",
        position: "bottom",
        bold: true,
        outline: 2,
        shadow: 1,
      },
      aspectRatio = "9:16",
    } = body;

    if (!clips || clips.length === 0) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }

    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: "No segments provided" }, { status: 400 });
    }

    const sessionId = uuidv4();
    const sessionDir = path.join(OUTPUT_DIR, sessionId);
    await ensureDir(sessionDir);

    const captionedClips: Array<{
      id: number;
      filename: string;
      downloadUrl: string;
      originalFilename: string;
    }> = [];

    for (const clip of clips) {
      const { localPath, start, end, id, filename: originalFilename } = clip;

      if (!localPath || !existsSync(localPath)) {
        continue;
      }

      const clipSegments = segments.filter(
        (seg: TranscriptSegment) =>
          (seg.start >= start && seg.start < end) ||
          (seg.end > start && seg.end <= end) ||
          (seg.start <= start && seg.end >= end)
      );

      const assContent = generateASS(
        clipSegments,
        start,
        captionStyle as CaptionStyle,
        aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920,
        aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080
      );

      const subtitlePath = path.join(sessionDir, `caption_${id}.ass`);
      await writeFile(subtitlePath, assContent);

      const outputFilename = `captioned_${originalFilename || `clip_${id}.mp4`}`;
      const outputPath = path.join(sessionDir, outputFilename);

      await burnCaptions(localPath, outputPath, subtitlePath, aspectRatio);

      captionedClips.push({
        id,
        filename: outputFilename,
        downloadUrl: `/api/opus/file?session=${sessionId}&file=${encodeURIComponent(outputFilename)}`,
        originalFilename: originalFilename || `clip_${id}.mp4`,
      });

      await unlink(subtitlePath);
    }

    const clipFiles = captionedClips.map((c) => path.join(sessionDir, c.filename));
    const zipFilename = `captioned_clips_${Date.now()}.zip`;
    const zipPath = path.join(sessionDir, zipFilename);
    await createZip(clipFiles, zipPath);

    cleanupAfterDelay(sessionDir);

    return NextResponse.json({
      success: true,
      sessionId,
      clips: captionedClips,
      zipUrl: `/api/opus/file?session=${sessionId}&file=${encodeURIComponent(zipFilename)}`,
      totalClips: captionedClips.length,
    });
  } catch (error) {
    console.error("Caption burn error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add captions" },
      { status: 500 }
    );
  }
}
