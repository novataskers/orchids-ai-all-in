import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    "yt-dlp.exe",
    path.join(process.cwd(), "yt-dlp.exe"),
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
  const jsonMode = searchParams.get("json") === "true";

  console.log(`[download-clip] Request: videoId=${videoId}, start=${start}, end=${end}, jsonMode=${jsonMode}`);

  if (!videoId || !start || !end) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const fileName = `clip-${videoId}-${start}-${end}.mp4`;
  const bucketName = 'clips';

  try {
    // 1. Check if clip already exists in Supabase Storage
    console.log(`[download-clip] Checking if ${fileName} exists in ${bucketName}`);
    const { data: existingFile } = await supabase.storage
      .from(bucketName)
      .list('', { search: fileName });

    if (existingFile && existingFile.length > 0 && existingFile.some(f => f.name === fileName)) {
      console.log(`[download-clip] Clip already exists in storage: ${fileName}`);
      const { data } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 1800); // 30 mins

      if (data?.signedUrl) {
        if (jsonMode) {
          return NextResponse.json({ url: data.signedUrl });
        }
        return NextResponse.redirect(data.signedUrl);
      }
    }
  } catch (err) {
    console.error(`[download-clip] Error checking storage:`, err);
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
  
  const baseArgs = [
    "--no-warnings",
    "--no-playlist",
    "--download-sections", `*${startTimeStr}-${endTimeStr}`,
    "--force-keyframes-at-cuts",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--retries", "5",
    "--fragment-retries", "5",
    "--no-check-certificates",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-o", outputPath,
    youtubeUrl
  ];

  if (hasCookies && fs.existsSync(cookiePath)) {
    baseArgs.unshift("--cookies", cookiePath);
    console.log(`[download-clip] Using cookies`);
  }

  const runYtDlp = async (useProxy: boolean) => {
    const args = [...baseArgs];
    const proxyUrl = process.env.BRIGHT_DATA_PROXY_URL;
    if (useProxy && proxyUrl) {
      args.unshift("--proxy", proxyUrl);
      console.log(`[download-clip] Attempting with Bright Data proxy...`);
    } else {
      console.log(`[download-clip] Attempting WITHOUT proxy...`);
    }

    console.log(`[download-clip] Running yt-dlp...`);
    return new Promise<{ success: boolean; error: string }>((resolve) => {
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
  };

  try {
    let ytdlpResult = await runYtDlp(!!process.env.BRIGHT_DATA_PROXY_URL);

    // Retry without proxy if proxy failed
    if (!ytdlpResult.success && process.env.BRIGHT_DATA_PROXY_URL) {
      console.log(`[download-clip] Proxy attempt failed, retrying without proxy...`);
      ytdlpResult = await runYtDlp(false);
    }

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

      try {
        // Upload to Supabase Storage
        console.log(`[download-clip] Uploading to Supabase Storage: ${fileName}`);
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileBuffer, {
            contentType: 'video/mp4',
            upsert: true
          });

        if (uploadError) {
          console.error(`[download-clip] Upload error:`, uploadError);
        } else {
          console.log(`[download-clip] Successfully uploaded to storage`);
        }
      } catch (err) {
        console.error(`[download-clip] Storage upload exception:`, err);
      }

      try { fs.unlinkSync(finalOutput); } catch {}

      // Get signed URL after upload (or just use public URL if it's public)
      const { data } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 1800);

      if (data?.signedUrl) {
        return NextResponse.redirect(data.signedUrl);
      }

      // Fallback if signed URL fails but we have the buffer
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${fileName}"`,
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
