import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

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
    let downloadUrl: string | null = null;
    let contentType = "video/mp4";

    // Method 1: Try ytstream RapidAPI for video
    if (process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying ytstream API...");
        const response = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.status === "OK" && data.formats) {
            const videoFormat = data.formats.find((f: any) => 
              f.mimeType?.includes("video/mp4") && f.qualityLabel && f.url
            );
            
            if (videoFormat?.url) {
              console.log(`[download-clip] Got video URL from ytstream: ${videoFormat.qualityLabel}`);
              downloadUrl = videoFormat.url;
              contentType = videoFormat.mimeType?.split(";")[0] || "video/mp4";
            }
          }
        }
      } catch (e) {
        console.log("[download-clip] ytstream error:", e);
      }
    }

    // Method 2: Try yt-api
    if (!downloadUrl && process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying yt-api for video...");
        const response = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "yt-api.p.rapidapi.com"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.formats) {
            const videoFormat = data.formats.find((f: any) => 
              f.mimeType?.includes("video/mp4") && f.url
            );
            
            if (videoFormat?.url) {
              console.log("[download-clip] Got video URL from yt-api");
              downloadUrl = videoFormat.url;
              contentType = videoFormat.mimeType?.split(";")[0] || "video/mp4";
            }
          }
        }
      } catch (e) {
        console.log("[download-clip] yt-api error:", e);
      }
    }

    if (!downloadUrl) {
      return NextResponse.json({
        error: "Could not get download URL. Please try downloading directly from YouTube.",
        youtubeUrl: `${youtubeUrl}&t=${start}`,
        manualInstructions: `Open the YouTube video at timestamp ${start}s and use a screen recorder or YouTube's clip feature.`
      }, { status: 503 });
    }

    // Proxy the video through our server to avoid IP-locking issues
    console.log("[download-clip] Proxying video download...");
    const videoResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Range": "bytes=0-",
      }
    });

    if (!videoResponse.ok && videoResponse.status !== 206) {
      console.log(`[download-clip] Video fetch failed: ${videoResponse.status}`);
      return NextResponse.json({
        error: "Failed to download video. Please try downloading directly from YouTube.",
        youtubeUrl: `${youtubeUrl}&t=${start}`,
      }, { status: 503 });
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    console.log(`[download-clip] Downloaded ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
        "Content-Length": videoBuffer.byteLength.toString(),
      }
    });
    
  } catch (error) {
    console.error("Download clip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download clip" },
      { status: 500 }
    );
  }
}
