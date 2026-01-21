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

function findYtDlp(): string {
  const possiblePaths = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp",
  ];
  
  for (const p of possiblePaths) {
    try {
      execSync(`${p} --version`, { stdio: "pipe", timeout: 5000 });
      console.log(`[download-clip] Found yt-dlp at ${p}`);
      return p;
    } catch {
      continue;
    }
  }
  return "";
}

function writeCookiesFile(cookiePath: string): boolean {
  const cookies = process.env.YOUTUBE_COOKIES;
  if (!cookies) return false;
  
  try {
    const cookieData = JSON.parse(cookies);
    let cookieContent = "# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n\n";
    cookieData.forEach((c: any) => {
      const expiry = Math.floor(c.expirationDate || 0);
      cookieContent += `${c.domain}\tTRUE\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${expiry}\t${c.name}\t${c.value}\n`;
    });
    fs.writeFileSync(cookiePath, cookieContent);
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

  console.log(`[download-clip] Request: videoId=${videoId}, start=${start}, end=${end}`);

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

  const ytDlpPath = findYtDlp();
  
  if (!ytDlpPath) {
    return NextResponse.json({ error: "yt-dlp not installed on server" }, { status: 500 });
  }

  const hasCookies = writeCookiesFile(cookiePath);
  const startTimeStr = formatTime(startSec);
  const endTimeStr = formatTime(endSec);
  
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--download-sections", `*${startTimeStr}-${endTimeStr}`,
    "--force-keyframes-at-cuts",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--retries", "5",
    "--fragment-retries", "5",
    "-o", outputPath,
    youtubeUrl
  ];

  const proxyUrl = process.env.BRIGHT_DATA_PROXY_URL;
  if (proxyUrl) {
    args.unshift("--proxy", proxyUrl);
    console.log(`[download-clip] Using Bright Data proxy`);
  }

  if (hasCookies && fs.existsSync(cookiePath)) {
    args.unshift("--cookies", cookiePath);
    console.log(`[download-clip] Using cookies`);
  }

  console.log(`[download-clip] Running yt-dlp with ffmpeg trimming...`);
  console.log(`[download-clip] Command: ${ytDlpPath} ${args.join(' ')}`);

  try {
    const ytdlpResult = await new Promise<{ success: boolean; error: string }>((resolve) => {
      const ytdlp = spawn(ytDlpPath, args, { timeout: 240000 });
      let stderr = "";
      
      ytdlp.stdout.on("data", (data) => {
        console.log(`[yt-dlp] ${data.toString().trim()}`);
      });
      
      ytdlp.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log(`[yt-dlp stderr] ${data.toString().trim()}`);
      });
      
      ytdlp.on("close", (code) => {
        console.log(`[yt-dlp] Exited with code ${code}`);
        resolve({ success: code === 0, error: stderr });
      });
      
      ytdlp.on("error", (err) => {
        console.log(`[yt-dlp] Error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });

    if (fs.existsSync(cookiePath)) {
      try { fs.unlinkSync(cookiePath); } catch {}
    }

    const possibleOutputs = [
      outputPath,
      outputPath.replace(".mp4", ".mp4.mp4"),
    ];
    
    const files = fs.readdirSync(tempDir);
    const matchingFile = files.find(f => f.startsWith(`clip-${videoId}-${timestamp}`) && f.endsWith(".mp4"));
    if (matchingFile) {
      possibleOutputs.push(path.join(tempDir, matchingFile));
    }

    let finalOutput = "";
    for (const p of possibleOutputs) {
      if (p && fs.existsSync(p)) {
        finalOutput = p;
        break;
      }
    }

    if (ytdlpResult.success && finalOutput) {
      console.log(`[download-clip] Success! Output: ${finalOutput}`);
      const fileBuffer = fs.readFileSync(finalOutput);
      try { fs.unlinkSync(finalOutput); } catch {}

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
          "Content-Length": fileBuffer.length.toString(),
        }
      });
    }

    console.log(`[download-clip] yt-dlp failed: ${ytdlpResult.error}`);
    return NextResponse.json({ 
      error: "Download failed",
      details: ytdlpResult.error.slice(0, 500),
      suggestion: "YouTube may be blocking. Try again or use a different video."
    }, { status: 500 });

  } catch (err: any) {
    console.log(`[download-clip] Error:`, err.message);
    if (fs.existsSync(cookiePath)) {
      try { fs.unlinkSync(cookiePath); } catch {}
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
