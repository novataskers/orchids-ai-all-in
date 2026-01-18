import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const DOWNLOAD_DIR = path.join(TMP_BASE, "youtube");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "No YouTube URL provided" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const sessionId = uuidv4();
    const sessionDir = path.join(DOWNLOAD_DIR, sessionId);
    await ensureDir(sessionDir);

    const youtube = await Innertube.create();
    const info = await youtube.getBasicInfo(videoId);

    const title = info.basic_info.title || "video";
    const duration = info.basic_info.duration || 0;
    const thumbnail = info.basic_info.thumbnail?.[0]?.url || "";

    const stream = await youtube.download(videoId, {
      type: "video+audio",
      quality: "best",
      format: "mp4",
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50);
    const filename = `${sanitizedTitle}.mp4`;
    const filepath = path.join(sessionDir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({
      success: true,
      sessionId,
      videoInfo: {
        title,
        duration,
        thumbnail,
        videoId,
      },
      filepath: `/api/opus/file?session=${sessionId}&file=${encodeURIComponent(filename)}`,
      localPath: filepath,
    });
  } catch (error) {
    console.error("YouTube download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download video" },
      { status: 500 }
    );
  }
}
