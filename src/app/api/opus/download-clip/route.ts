import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

async function getVideoStreamUrl(videoId: string): Promise<{ videoUrl: string; audioUrl?: string } | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  
  if (rapidApiKey) {
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
        
        if (data.status === "OK") {
          const videoFormat = data.formats?.find((f: any) => 
            f.mimeType?.includes("video/mp4") && f.qualityLabel && f.url
          ) || data.adaptiveFormats?.find((f: any) => 
            f.mimeType?.includes("video/mp4") && f.url
          );
          
          const audioFormat = data.adaptiveFormats?.find((f: any) => 
            f.mimeType?.includes("audio") && f.url
          );
          
          if (videoFormat?.url) {
            return { 
              videoUrl: videoFormat.url,
              audioUrl: audioFormat?.url
            };
          }
        }
      }
    } catch (e) {
      console.log("[download-clip] ytstream error:", e);
    }
    
    try {
      const response = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
        method: "GET",
        headers: {
          "x-rapidapi-key": rapidApiKey,
          "x-rapidapi-host": "yt-api.p.rapidapi.com"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        const videoFormat = data.formats?.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.qualityLabel && f.url
        ) || data.adaptiveFormats?.find((f: any) => 
          f.mimeType?.includes("video/mp4") && f.url
        );
        
        if (videoFormat?.url) {
          return { videoUrl: videoFormat.url };
        }
      }
    } catch (e) {
      console.log("[download-clip] yt-api error:", e);
    }
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
