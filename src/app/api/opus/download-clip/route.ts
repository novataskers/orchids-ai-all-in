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

function checkYtdlp(): boolean {
  try {
    execSync("yt-dlp --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
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

  const hasYtdlp = checkYtdlp();
  console.log(`[download-clip] yt-dlp available: ${hasYtdlp}`);

  if (!hasYtdlp) {
    return NextResponse.json({ 
      error: "yt-dlp not available on server. Please ensure Dockerfile installs yt-dlp." 
    }, { status: 500 });
  }

  try {
    console.log(`[download-clip] Processing ${videoId} from ${start}s to ${end}s`);
    
    const cookies = process.env.YOUTUBE_COOKIES;
    if (cookies) {
      try {
        const cookieData = JSON.parse(cookies);
        let cookieContent = "# Netscape HTTP Cookie File\n";
        cookieData.forEach((c: any) => {
          cookieContent += `${c.domain}\tTRUE\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${Math.floor(c.expirationDate || 0)}\t${c.name}\t${c.value}\n`;
        });
        fs.writeFileSync(cookiePath, cookieContent);
        console.log(`[download-clip] Cookie file created`);
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

    console.log(`[download-clip] Running: yt-dlp ${args.join(" ")}`);

    const ytdlpResult = await new Promise<{ success: boolean; error: string }>((resolve) => {
      const ytdlp = spawn("yt-dlp", args);
      let stdout = "";
      let stderr = "";
      
      ytdlp.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(`[yt-dlp stdout] ${data.toString().trim()}`);
      });
      
      ytdlp.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log(`[yt-dlp stderr] ${data.toString().trim()}`);
      });
      
      ytdlp.on("close", (code) => {
        console.log(`[download-clip] yt-dlp exited with code ${code}`);
        if (code === 0) {
          resolve({ success: true, error: "" });
        } else {
          resolve({ success: false, error: stderr || stdout || `Exit code: ${code}` });
        }
      });
      
      ytdlp.on("error", (err) => {
        console.error(`[download-clip] yt-dlp spawn error:`, err);
        resolve({ success: false, error: err.message });
      });
    });

    const outputFiles = fs.readdirSync(tempDir).filter(f => 
      f.startsWith(`clip-${videoId}-${timestamp}`) && f.endsWith(".mp4")
    );
    
    let finalOutputPath = outputPath;
    if (!fs.existsSync(outputPath) && outputFiles.length > 0) {
      finalOutputPath = path.join(tempDir, outputFiles[0]);
    }

    if (ytdlpResult.success && fs.existsSync(finalOutputPath)) {
      const stats = fs.statSync(finalOutputPath);
      console.log(`[download-clip] Success! File size: ${stats.size} bytes`);
      
      const fileBuffer = fs.readFileSync(finalOutputPath);
      
      try {
        fs.unlinkSync(finalOutputPath);
        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
      } catch (e) {}

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
          "Content-Length": stats.size.toString(),
        }
      });
    }

    console.error(`[download-clip] Failed: ${ytdlpResult.error}`);
    return NextResponse.json({ 
      error: "Download failed", 
      details: ytdlpResult.error 
    }, { status: 500 });

  } catch (error: any) {
    console.error("[download-clip] Error:", error);
    return NextResponse.json({ error: error.message || "Download failed" }, { status: 500 });
  } finally {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    } catch (e) {}
  }
}
