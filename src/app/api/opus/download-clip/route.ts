import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const maxDuration = 300;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function checkYtdlp(): string | null {
  const paths = [
    process.platform === "win32" ? "yt-dlp.exe" : "/usr/local/bin/yt-dlp",
    "yt-dlp"
  ];
  
  for (const p of paths) {
    try {
      execSync(`${p} --version`, { stdio: "pipe" });
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

async function downloadWithRapidAPI(videoId: string, startSec: number, endSec: number): Promise<Buffer | null> {
  if (!process.env.RAPIDAPI_KEY) return null;

  const apis = [
    {
      host: "ytstream-download-youtube-videos.p.rapidapi.com",
      url: `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`
    },
    {
      host: "yt-api.p.rapidapi.com",
      url: `https://yt-api.p.rapidapi.com/dl?id=${videoId}`
    }
  ];

  for (const api of apis) {
    try {
      console.log(`[download-clip] Trying RapidAPI: ${api.host}`);
      const res = await fetch(api.url, {
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
          "x-rapidapi-host": api.host
        }
      });

      if (!res.ok) continue;
      const data = await res.json();
      
      // Look for a format that has both audio and video and is MP4
      const formats = data.formats || data.adaptiveFormats || [];
      const format = formats.find((f: any) => 
        (f.mimeType?.includes("video/mp4") || f.extension === "mp4") && 
        (f.hasAudio || f.audioQuality) && 
        f.url
      );

      if (format?.url) {
        console.log(`[download-clip] Got direct URL from ${api.host}, trimming with ffmpeg...`);
        const tempDir = os.tmpdir();
        const outputPath = path.join(tempDir, `trim-${videoId}-${Date.now()}.mp4`);
        
        // Use ffmpeg to trim the remote URL
        const duration = endSec - startSec;
        const ffmpegCmd = `ffmpeg -ss ${startSec} -t ${duration} -i "${format.url}" -c copy -y "${outputPath}"`;
        
        try {
          execSync(ffmpegCmd, { timeout: 60000 });
          if (fs.existsSync(outputPath)) {
            const buffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            if (buffer.length > 1000) return buffer;
          }
        } catch (e) {
          console.error(`[download-clip] ffmpeg trim failed:`, e);
        }
      }
    } catch (e) {
      console.error(`[download-clip] RapidAPI ${api.host} error:`, e);
    }
  }
  return null;
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
  const timestamp = Date.now();
  const outputPath = path.join(tempDir, `clip-${videoId}-${timestamp}.mp4`);
  const cookiePath = path.join(tempDir, `cookies-${timestamp}.txt`);

  const ytDlpPath = checkYtdlp();
  console.log(`[download-clip] yt-dlp path: ${ytDlpPath || "not found"}`);

  // Try yt-dlp first if available
  if (ytDlpPath) {
    try {
      console.log(`[download-clip] Processing ${videoId} from ${start}s to ${end}s with yt-dlp`);
      
      const cookies = process.env.YOUTUBE_COOKIES;
      if (cookies) {
        try {
          const cookieData = JSON.parse(cookies);
          let cookieContent = "# Netscape HTTP Cookie File\n";
          cookieData.forEach((c: any) => {
            cookieContent += `${c.domain}\tTRUE\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${Math.floor(c.expirationDate || 0)}\t${c.name}\t${c.value}\n`;
          });
          fs.writeFileSync(cookiePath, cookieContent);
        } catch (e) {
          console.error("[download-clip] Error writing cookies:", e);
        }
      }

      const startTimeStr = formatTime(startSec);
      const endTimeStr = formatTime(endSec);
      
      const args = [
        "--no-warnings",
        "--no-playlist",
        "--download-sections", `*${startTimeStr}-${endTimeStr}`,
        "--force-keyframes-at-cuts",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outputPath,
        youtubeUrl
      ];

      if (fs.existsSync(cookiePath)) {
        args.unshift("--cookies", cookiePath);
      }

      const ytdlpResult = await new Promise<{ success: boolean; error: string }>((resolve) => {
        const ytdlp = spawn(ytDlpPath, args);
        let stderr = "";
        
        ytdlp.stdout.on("data", (data) => console.log(`[yt-dlp] ${data.toString().trim().split('\n')[0]}`));
        ytdlp.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        
        ytdlp.on("close", (code) => {
          if (code === 0) resolve({ success: true, error: "" });
          else resolve({ success: false, error: stderr || `Exit code: ${code}` });
        });
        
        ytdlp.on("error", (err) => resolve({ success: false, error: err.message }));
      });

      if (ytdlpResult.success && fs.existsSync(outputPath)) {
        const fileBuffer = fs.readFileSync(outputPath);
        try {
          fs.unlinkSync(outputPath);
          if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
        } catch (e) {}

        return new NextResponse(fileBuffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
            "Content-Length": fileBuffer.length.toString(),
          }
        });
      }
      console.log(`[download-clip] yt-dlp failed, trying fallback... Error: ${ytdlpResult.error.slice(0, 100)}`);
    } catch (err) {
      console.error(`[download-clip] yt-dlp error:`, err);
    } finally {
      if (fs.existsSync(cookiePath)) try { fs.unlinkSync(cookiePath); } catch (e) {}
    }
  }

  // Fallback to RapidAPI + ffmpeg
  console.log(`[download-clip] Using RapidAPI fallback for ${videoId}`);
  const rapidBuffer = await downloadWithRapidAPI(videoId, startSec, endSec);
  
  if (rapidBuffer) {
    console.log(`[download-clip] Success using RapidAPI fallback!`);
    return new NextResponse(rapidBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
        "Content-Length": rapidBuffer.length.toString(),
      }
    });
  }

  // Final fallback: Try Cobalt for the WHOLE video (if it's not too long)
  try {
    console.log(`[download-clip] Final fallback: Trying Cobalt API...`);
    const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ url: youtubeUrl, videoQuality: "720" })
    });
    const cobaltData = await cobaltRes.json();
    if (cobaltData.url) {
      const videoRes = await fetch(cobaltData.url);
      if (videoRes.ok) {
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="video-${videoId}.mp4"`,
          }
        });
      }
    }
  } catch (e) {
    console.error(`[download-clip] Cobalt fallback failed:`, e);
  }

  return NextResponse.json({ error: "All download methods failed. The video might be restricted or too large." }, { status: 500 });
}
