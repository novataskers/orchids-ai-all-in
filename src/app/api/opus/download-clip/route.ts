import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

async function downloadWithRapidAPI(videoId: string, startSec: number, endSec: number): Promise<Buffer | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    console.log("[download-clip] No RAPIDAPI_KEY found");
    return null;
  }

  try {
    console.log("[download-clip] Trying RapidAPI fallback...");
    
    const infoRes = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
      }
    });

    if (!infoRes.ok) {
      console.log(`[download-clip] RapidAPI info failed: ${infoRes.status}`);
      return null;
    }

    const info = await infoRes.json();
    
    let downloadUrl = null;
    if (info.formats) {
      const mp4Format = info.formats.find((f: any) => 
        f.mimeType?.includes("video/mp4") && f.hasAudio && f.hasVideo
      ) || info.formats.find((f: any) => f.mimeType?.includes("video/mp4"));
      
      if (mp4Format?.url) {
        downloadUrl = mp4Format.url;
      }
    }
    
    if (!downloadUrl && info.adaptiveFormats) {
      const videoFormat = info.adaptiveFormats.find((f: any) => 
        f.mimeType?.includes("video/mp4") && f.qualityLabel
      );
      if (videoFormat?.url) {
        downloadUrl = videoFormat.url;
      }
    }

    if (!downloadUrl) {
      console.log("[download-clip] No suitable format found in RapidAPI response");
      return null;
    }

    console.log("[download-clip] Downloading full video from RapidAPI...");
    const videoRes = await fetch(downloadUrl);
    if (!videoRes.ok) {
      console.log(`[download-clip] Video download failed: ${videoRes.status}`);
      return null;
    }

    const fullVideoBuffer = Buffer.from(await videoRes.arrayBuffer());
    console.log(`[download-clip] Downloaded ${fullVideoBuffer.length} bytes, now trimming...`);

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `full-${videoId}-${timestamp}.mp4`);
    const outputPath = path.join(tempDir, `trimmed-${videoId}-${timestamp}.mp4`);

    fs.writeFileSync(inputPath, fullVideoBuffer);

    const ffmpegResult = await new Promise<boolean>((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-ss", startSec.toString(),
        "-i", inputPath,
        "-t", (endSec - startSec).toString(),
        "-c", "copy",
        "-avoid_negative_ts", "1",
        outputPath
      ], { timeout: 60000 });

      ffmpeg.on("close", (code) => {
        resolve(code === 0);
      });
      ffmpeg.on("error", () => resolve(false));
    });

    try { fs.unlinkSync(inputPath); } catch {}

    if (ffmpegResult && fs.existsSync(outputPath)) {
      const trimmedBuffer = fs.readFileSync(outputPath);
      try { fs.unlinkSync(outputPath); } catch {}
      console.log(`[download-clip] RapidAPI + ffmpeg trim successful: ${trimmedBuffer.length} bytes`);
      return trimmedBuffer;
    }

    console.log("[download-clip] ffmpeg trim failed, returning full video");
    return fullVideoBuffer;

  } catch (err: any) {
    console.error("[download-clip] RapidAPI error:", err.message);
    return null;
  }
}

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
    process.platform === "win32" ? "yt-dlp.exe" : ""
  ].filter(Boolean);
  
  for (const p of possiblePaths) {
    try {
      const version = execSync(`${p} --version`, { stdio: "pipe", timeout: 5000 }).toString().trim();
      console.log(`[download-clip] Found yt-dlp at ${p}, version: ${version}`);
      return p;
    } catch {
      continue;
    }
  }
  console.log(`[download-clip] yt-dlp not found in any known path, using default`);
  return "yt-dlp";
}

function writeCookiesFile(cookiePath: string): boolean {
  const cookies = process.env.YOUTUBE_COOKIES;
  if (!cookies) {
    console.log(`[download-clip] No YOUTUBE_COOKIES env var found`);
    return false;
  }
  
  try {
    const cookieData = JSON.parse(cookies);
    let cookieContent = "# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n# This is a generated file! Edit at your own risk.\n\n";
    cookieData.forEach((c: any) => {
      const expiry = Math.floor(c.expirationDate || 0);
      cookieContent += `${c.domain}\tTRUE\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${expiry}\t${c.name}\t${c.value}\n`;
    });
    fs.writeFileSync(cookiePath, cookieContent);
    console.log(`[download-clip] Wrote ${cookieData.length} cookies to ${cookiePath}`);
    return true;
  } catch (e) {
    console.error("[download-clip] Error writing cookies:", e);
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

  console.log(`[download-clip] tempDir: ${tempDir}, outputPath: ${outputPath}`);

  const ytDlpPath = findYtDlp();
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
    "--retries", "3",
    "--fragment-retries", "3",
    "-o", outputPath,
    youtubeUrl
  ];

  const warpProxy = process.env.WARP_PROXY;
  if (warpProxy) {
    args.unshift("--proxy", warpProxy);
    console.log(`[download-clip] Using WARP proxy: ${warpProxy}`);
  }

  if (hasCookies && fs.existsSync(cookiePath)) {
    args.unshift("--cookies", cookiePath);
  }

  console.log(`[download-clip] Running: ${ytDlpPath} ${args.slice(0, 5).join(' ')}... ${youtubeUrl}`);

  try {
    const ytdlpResult = await new Promise<{ success: boolean; error: string; stdout: string }>((resolve) => {
      const ytdlp = spawn(ytDlpPath, args, { timeout: 240000 });
      let stderr = "";
      let stdout = "";
      
      ytdlp.stdout.on("data", (data) => {
        const line = data.toString().trim();
        stdout += line + "\n";
        console.log(`[yt-dlp stdout] ${line.split('\n')[0]}`);
      });
      
      ytdlp.stderr.on("data", (data) => {
        const line = data.toString().trim();
        stderr += line + "\n";
        console.log(`[yt-dlp stderr] ${line.split('\n')[0]}`);
      });
      
      ytdlp.on("close", (code) => {
        console.log(`[download-clip] yt-dlp exited with code ${code}`);
        if (code === 0) {
          resolve({ success: true, error: "", stdout });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}`, stdout });
        }
      });
      
      ytdlp.on("error", (err) => {
        console.log(`[download-clip] yt-dlp spawn error: ${err.message}`);
        resolve({ success: false, error: err.message, stdout });
      });
    });

    if (fs.existsSync(cookiePath)) {
      try { fs.unlinkSync(cookiePath); } catch {}
    }

    const possibleOutputs = [
      outputPath,
      outputPath.replace(".mp4", ".mp4.mp4"),
      path.join(tempDir, fs.readdirSync(tempDir).find(f => f.startsWith(`clip-${videoId}-${timestamp}`) && f.endsWith(".mp4")) || "")
    ];

    let finalOutput = "";
    for (const p of possibleOutputs) {
      if (p && fs.existsSync(p)) {
        finalOutput = p;
        break;
      }
    }

    if (ytdlpResult.success && finalOutput) {
      console.log(`[download-clip] Success! Output file: ${finalOutput}`);
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

      console.log(`[download-clip] yt-dlp failed. Success: ${ytdlpResult.success}, File exists: ${!!finalOutput}`);
      console.log(`[download-clip] Error: ${ytdlpResult.error.slice(0, 500)}`);
      
      const rapidApiBuffer = await downloadWithRapidAPI(videoId, startSec, endSec);
      if (rapidApiBuffer) {
        return new NextResponse(rapidApiBuffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="clip-${videoId}.mp4"`,
            "Content-Length": rapidApiBuffer.length.toString(),
          }
        });
      }
      
      return NextResponse.json({ 
        error: "Download failed. YouTube may be blocking this request.", 
        details: ytdlpResult.error.slice(0, 200)
      }, { status: 500 });

  } catch (err: any) {
    console.error(`[download-clip] Exception:`, err);
    
    if (fs.existsSync(cookiePath)) {
      try { fs.unlinkSync(cookiePath); } catch {}
    }
    
    return NextResponse.json({ 
      error: "Download failed due to an unexpected error.", 
      details: err.message 
    }, { status: 500 });
  }
}
