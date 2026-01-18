import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const OUTPUT_DIR = path.join(TMP_BASE, "outputs");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const session = searchParams.get("session");
  const file = searchParams.get("file");

  if (!session || !file) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const sanitizedSession = session.replace(/[^a-zA-Z0-9-]/g, "");
  const sanitizedFile = path.basename(file);
  const filePath = path.join(OUTPUT_DIR, sanitizedSession, sanitizedFile);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const fileBuffer = await readFile(filePath);
    
    let contentType = "application/octet-stream";
    let disposition = "attachment";
      
    if (sanitizedFile.endsWith(".mp4")) {
      contentType = "video/mp4";
      disposition = "inline";
    } else if (sanitizedFile.endsWith(".mov")) {
      contentType = "video/quicktime";
      disposition = "inline";
    } else if (sanitizedFile.endsWith(".mkv")) {
      contentType = "video/x-matroska";
      disposition = "inline";
    } else if (sanitizedFile.endsWith(".zip")) {
      contentType = "application/zip";
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${sanitizedFile}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
