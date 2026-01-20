import { NextRequest, NextResponse } from "next/server";

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
            }
          }
        }
      } catch (e) {
        console.log("[download-clip] ytstream error:", e);
      }
    }

    // Method 2: Try youtube-mp36 for video (though it's primarily for audio)
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

    return NextResponse.redirect(downloadUrl);
    
  } catch (error) {
    console.error("Download clip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download clip" },
      { status: 500 }
    );
  }
}
