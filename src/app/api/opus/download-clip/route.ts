import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

async function getVideoStreamUrl(videoId: string): Promise<{ videoUrl: string; audioUrl?: string } | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  
  console.log("[download-clip] RAPIDAPI_KEY present:", !!rapidApiKey);
  
  if (!rapidApiKey) {
    console.log("[download-clip] No RAPIDAPI_KEY found!");
    return null;
  }

  try {
    console.log("[download-clip] Trying youtube-media-downloader API...");
    const response = await fetch(`https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=${videoId}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "youtube-media-downloader.p.rapidapi.com"
      }
    });
    
    console.log("[download-clip] youtube-media-downloader status:", response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log("[download-clip] Response keys:", Object.keys(data));
      
      if (data.videos?.items) {
        const mp4WithAudio = data.videos.items.find((v: any) => 
          v.extension === "mp4" && v.hasAudio && v.url
        );
        
        if (mp4WithAudio?.url) {
          console.log("[download-clip] Found MP4 with audio:", mp4WithAudio.quality);
          return { videoUrl: mp4WithAudio.url };
        }
      }
    }
  } catch (e) {
    console.log("[download-clip] youtube-media-downloader error:", e);
  }

  try {
    console.log("[download-clip] Trying ytstream API...");
    const response = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
      }
    });
    
    console.log("[download-clip] ytstream status:", response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log("[download-clip] ytstream response status:", data.status);
      
      if (data.status === "OK" && data.formats) {
        const videoFormat = data.formats.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.hasAudio && f.hasVideo && f.url
        ) || data.formats.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.url
        );
        
        if (videoFormat?.url) {
          console.log("[download-clip] Found ytstream format:", videoFormat.qualityLabel);
          return { videoUrl: videoFormat.url };
        }
      }
    }
  } catch (e) {
    console.log("[download-clip] ytstream error:", e);
  }
  
  return null;
}

async function downloadVideoBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
        "Range": "bytes=0-",
      }
    });
    
    if (response.ok || response.status === 206) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (e) {
    console.log("[download-clip] Download error:", e);
  }
  return null;
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

  const streamData = await getVideoStreamUrl(videoId);
  
  if (streamData?.videoUrl) {
    console.log(`[download-clip] Got video stream URL, downloading full video...`);
    
    const videoBuffer = await downloadVideoBuffer(streamData.videoUrl);
    
    if (videoBuffer && videoBuffer.length > 10000) {
      console.log(`[download-clip] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      return new NextResponse(videoBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
          "Content-Length": videoBuffer.length.toString(),
        }
      });
    }
  }

  return NextResponse.json({
    error: "Could not download video. Please try again later.",
    youtubeUrl: `${youtubeUrl}&t=${start}`,
    clipInfo: {
      videoId,
      startTime: start,
      endTime: end,
      duration: `${endSec - startSec} seconds`
    }
  }, { status: 503 });
}
