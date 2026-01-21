import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export const maxDuration = 300;

async function downloadWithYtDlp(videoId: string, start: number, end: number): Promise<Buffer | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = path.join(os.tmpdir(), `clip-${videoId}-${Date.now()}`);
  const outputTemplate = path.join(tempDir, `clip.%(ext)s`);
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Use yt-dlp with download-sections to trim the video
    const command = `yt-dlp --download-sections "*${start}-${end}" --force-keyframes-at-cuts -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" --no-playlist "${youtubeUrl}"`;
    
    console.log(`[download-clip] Running: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024 
    });
    
    console.log("[download-clip] yt-dlp stdout:", stdout.slice(-500));
    if (stderr) console.log("[download-clip] yt-dlp stderr:", stderr.slice(-500));
    
    // Find the output file
    const files = fs.readdirSync(tempDir);
    const videoFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'));
    
    if (videoFile) {
      const filePath = path.join(tempDir, videoFile);
      const buffer = fs.readFileSync(filePath);
      console.log(`[download-clip] Success! File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
      return buffer;
    }
    
    console.log("[download-clip] No video file found in temp dir");
    fs.rmSync(tempDir, { recursive: true, force: true });
    return null;
    
  } catch (error: any) {
    console.error("[download-clip] yt-dlp error:", error.message);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!videoId || !start || !end) {
    return NextResponse.json(
      { error: "Missing videoId, start, or end parameters" },
      { status: 400 }
    );
  }

  const startSec = parseInt(start);
  const endSec = parseInt(end);
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`[download-clip] Request: ${youtubeUrl} (${startSec}s - ${endSec}s)`);

  // Try yt-dlp (works on Railway, localhost with yt-dlp installed)
  const videoBuffer = await downloadWithYtDlp(videoId, startSec, endSec);
  
  if (videoBuffer) {
    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
        "Content-Length": videoBuffer.length.toString(),
      }
    });
  }

  // Fallback - return instructions
  return NextResponse.json({
    error: "yt-dlp not available on this server. Deploy to Railway for full functionality.",
    youtubeUrl: `${youtubeUrl}&t=${start}`,
    clipInfo: {
      videoId,
      startTime: start,
      endTime: end,
      duration: `${endSec - startSec} seconds`
    },
    instructions: [
      "1. Install yt-dlp: https://github.com/yt-dlp/yt-dlp",
      `2. Run: yt-dlp --download-sections "*${start}-${end}" "${youtubeUrl}"`,
    ]
  }, { status: 503 });
}
