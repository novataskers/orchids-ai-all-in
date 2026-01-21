import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const maxDuration = 300;

async function getVideoStreamUrl(videoId: string): Promise<{ videoUrl: string; audioUrl?: string } | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  
  if (!rapidApiKey) {
    return null;
  }

  try {
    const response = await fetch(`https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=${videoId}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "youtube-media-downloader.p.rapidapi.com"
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.videos?.items) {
        const mp4WithAudio = data.videos.items.find((v: any) => 
          v.extension === "mp4" && v.hasAudio && v.url
        );
        if (mp4WithAudio?.url) return { videoUrl: mp4WithAudio.url };
      }
    }
  } catch (e) {}

  try {
    const response = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === "OK" && data.formats) {
        const videoFormat = data.formats.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.hasAudio && f.hasVideo && f.url
        ) || data.formats.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.url
        );
        if (videoFormat?.url) return { videoUrl: videoFormat.url };
      }
    }
  } catch (e) {}
  
  return null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!videoId || !start || !end) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const startSec = parseInt(start);
  const endSec = parseInt(end);
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `clip-${videoId}-${start}-${end}-${Date.now()}.mp4`);
  const cookiePath = path.join(tempDir, `cookies-${Date.now()}.txt`);

  try {
    // 1. Try yt-dlp (Best for Railway)
    console.log(`[download-clip] Attempting yt-dlp for ${videoId} (${start}-${end})`);
    
    const cookies = process.env.YOUTUBE_COOKIES;
    if (cookies) {
      try {
        const cookieData = JSON.parse(cookies);
        let cookieContent = "# Netscape HTTP Cookie File\n";
        cookieData.forEach((c: any) => {
          cookieContent += `${c.domain}\tTRUE\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${c.expirationDate || 0}\t${c.name}\t${c.value}\n`;
        });
        fs.writeFileSync(cookiePath, cookieContent);
      } catch (e) {
        console.error("[download-clip] Error writing cookies:", e);
      }
    }

    const startTimeStr = formatTime(startSec);
    const endTimeStr = formatTime(endSec);
    
    const args = [
      "--download-sections", `*${startTimeStr}-${endTimeStr}`,
      "--force-keyframes-at-cuts",
      "-f", "mp4",
      "-o", outputPath,
      youtubeUrl
    ];

    if (fs.existsSync(cookiePath)) {
      args.unshift("--cookies", cookiePath);
    }

    const ytdlp = spawn("yt-dlp", args);

    const success = await new Promise((resolve) => {
      let errorLog = "";
      ytdlp.stderr.on("data", (data) => errorLog += data.toString());
      ytdlp.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(true);
        } else {
          console.error(`[download-clip] yt-dlp failed with code ${code}: ${errorLog}`);
          resolve(false);
        }
      });
    });

    if (success) {
      const stats = fs.statSync(outputPath);
      const fileStream = fs.createReadStream(outputPath);
      
      // We need to handle the readable stream conversion for Next.js response
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => {
            controller.close();
            // Cleanup after streaming finishes
            try {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
            } catch (e) {}
          });
          fileStream.on("error", (err) => controller.error(err));
        }
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
          "Content-Length": stats.size.toString(),
        }
      });
    }

    // 2. Fallback to RapidAPI + Buffer (Legacy/Local)
    console.log(`[download-clip] yt-dlp failed or unavailable, trying fallback...`);
    const streamData = await getVideoStreamUrl(videoId);
    if (streamData?.videoUrl) {
      const response = await fetch(streamData.videoUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="full-video-${videoId}.mp4"`,
            "Content-Length": buffer.length.toString(),
          }
        });
      }
    }

  } catch (error: any) {
    console.error("[download-clip] Error:", error);
  } finally {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    } catch (e) {}
  }

  return NextResponse.json({ error: "Download failed" }, { status: 500 });
}
