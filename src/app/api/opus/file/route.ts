import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const DOWNLOAD_DIR = path.join(TMP_BASE, "youtube");
const OUTPUT_DIR = path.join(TMP_BASE, "opus-outputs");
const CAPTIONED_DIR = path.join(TMP_BASE, "opus-captioned");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session");
  const filename = searchParams.get("file");

  if (!sessionId || !filename) {
    return NextResponse.json({ error: "Missing session or file parameter" }, { status: 400 });
  }

  const decodedFilename = decodeURIComponent(filename);
  
  let filepath = path.join(DOWNLOAD_DIR, sessionId, decodedFilename);
  if (!existsSync(filepath)) {
    filepath = path.join(OUTPUT_DIR, sessionId, decodedFilename);
  }
  if (!existsSync(filepath)) {
    filepath = path.join(CAPTIONED_DIR, sessionId, decodedFilename);
  }

  if (!existsSync(filepath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buffer = await readFile(filepath);
    const ext = path.extname(decodedFilename).toLowerCase();
    
    let contentType = "application/octet-stream";
    if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".wav") contentType = "audio/wav";
    else if (ext === ".srt") contentType = "text/plain";
    else if (ext === ".json") contentType = "application/json";
    else if (ext === ".zip") contentType = "application/zip";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${decodedFilename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("File read error:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
