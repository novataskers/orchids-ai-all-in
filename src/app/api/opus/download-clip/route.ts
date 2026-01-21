import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

async function tryDownloadFromRapidAPI(videoId: string): Promise<ArrayBuffer | null> {
  if (!process.env.RAPIDAPI_KEY) {
    console.log("[download-clip] No RAPIDAPI_KEY");
    return null;
  }
  
  try {
    console.log("[download-clip] Trying ytstream API...");
    
    const response = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
      }
    });
    
    if (!response.ok) {
      console.log("[download-clip] ytstream returned status", response.status);
      return null;
    }
    
    const data = await response.json();
    console.log("[download-clip] ytstream status:", data.status);
    
    if (data.status !== "OK") {
      console.log("[download-clip] ytstream error:", data);
      return null;
    }
    
    let downloadUrl: string | null = null;
    let qualityLabel = "";
    
    // First, try the formats array which has combined audio+video
    if (data.formats && data.formats.length > 0) {
      const mp4 = data.formats.find((f: any) => 
        f.mimeType && f.mimeType.includes("video/mp4") && f.url
      );
      
      if (mp4) {
        downloadUrl = mp4.url;
        qualityLabel = mp4.qualityLabel || "unknown";
        console.log("[download-clip] Found combined format:", qualityLabel);
      }
    }
    
    if (!downloadUrl) {
      console.log("[download-clip] No combined format found");
      return null;
    }
    
    console.log("[download-clip] Downloading from URL...");
    const videoResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    
    if (!videoResponse.ok) {
      console.log("[download-clip] Video download failed:", videoResponse.status);
      return null;
    }
    
    const buffer = await videoResponse.arrayBuffer();
    console.log(`[download-clip] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB (${qualityLabel})`);
    
    if (buffer.byteLength < 10000) {
      console.log("[download-clip] Downloaded file too small, probably an error");
      return null;
    }
    
    return buffer;
    
  } catch (e) {
    console.log("[download-clip] ytstream error:", e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
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

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const startSec = parseInt(start);
    const endSec = parseInt(end);
    
    console.log(`[download-clip] Request for ${youtubeUrl} (${startSec}s - ${endSec}s)`);
    console.log(`[download-clip] RAPIDAPI_KEY present: ${!!process.env.RAPIDAPI_KEY}`);

    const videoBuffer = await tryDownloadFromRapidAPI(videoId);
    
    if (videoBuffer) {
      console.log("[download-clip] Success! Returning video...");
      return new NextResponse(videoBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
          "Content-Length": videoBuffer.byteLength.toString(),
        }
      });
    }

    console.log("[download-clip] All methods failed, returning fallback");
    return NextResponse.json({
      error: "YouTube download services are currently unavailable.",
      youtubeUrl: `${youtubeUrl}&t=${start}`,
      clipInfo: {
        videoId,
        startTime: start,
        endTime: end,
        duration: `${endSec - startSec} seconds`
      },
      instructions: [
        "1. Install yt-dlp on your computer: https://github.com/yt-dlp/yt-dlp",
        `2. Run: yt-dlp --download-sections "*${start}-${end}" "${youtubeUrl}"`,
        "3. Or use a browser extension like 'Video DownloadHelper'",
      ]
    }, { status: 503 });
    
  } catch (error) {
    console.error("[download-clip] Error:", error);
    
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId") || "";
    const start = searchParams.get("start") || "0";
    const end = searchParams.get("end") || "0";
    
    return NextResponse.json({
      error: "YouTube download failed.",
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}&t=${start}`,
      instructions: [
        `1. Use yt-dlp: yt-dlp --download-sections "*${start}-${end}" "https://www.youtube.com/watch?v=${videoId}"`,
      ]
    }, { status: 503 });
  }
}
