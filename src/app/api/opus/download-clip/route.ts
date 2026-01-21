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
    
    // Try ytstream API - it returns direct stream URLs
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
          console.log("[download-clip] ytstream response keys:", Object.keys(data));
          
          // Look for video+audio format in formats array
          if (data.formats && Array.isArray(data.formats)) {
            // Find highest quality mp4 with both video and audio
            const mp4Format = data.formats
              .filter((f: any) => f.mimeType?.includes("video/mp4") && f.hasAudio && f.hasVideo)
              .sort((a: any, b: any) => (b.contentLength || 0) - (a.contentLength || 0))[0];
            
            if (mp4Format?.url) {
              console.log("[download-clip] Found mp4 format:", mp4Format.qualityLabel);
              const videoResponse = await fetch(mp4Format.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Range": "bytes=0-"
                }
              });
              
              if (videoResponse.ok || videoResponse.status === 206) {
                const videoBuffer = await videoResponse.arrayBuffer();
                console.log(`[download-clip] Downloaded ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
                
                return new NextResponse(videoBuffer, {
                  headers: {
                    "Content-Type": "video/mp4",
                    "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
                    "Content-Length": videoBuffer.byteLength.toString(),
                  }
                });
              }
              console.log("[download-clip] Video fetch failed:", videoResponse.status);
            }
          }
          
          // Try adaptiveFormats - video only, then we'd need to merge but let's try anyway
          if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
            const videoFormat = data.adaptiveFormats
              .filter((f: any) => f.mimeType?.includes("video/mp4"))
              .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            
            if (videoFormat?.url) {
              console.log("[download-clip] Trying adaptive format...");
              const videoResponse = await fetch(videoFormat.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
              });
              
              if (videoResponse.ok) {
                const videoBuffer = await videoResponse.arrayBuffer();
                console.log(`[download-clip] Downloaded adaptive ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
                
                return new NextResponse(videoBuffer, {
                  headers: {
                    "Content-Type": "video/mp4",
                    "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
                    "Content-Length": videoBuffer.byteLength.toString(),
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        console.log("[download-clip] ytstream error:", e);
      }
    }

    // Try Cobalt API (public instances)
    const cobaltInstances = [
      "https://cobalt.api.timelessnesses.me",
      "https://api.cobalt.tools",
    ];
    
    for (const instance of cobaltInstances) {
      try {
        console.log(`[download-clip] Trying Cobalt instance: ${instance}`);
        const response = await fetch(`${instance}/api/json`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: youtubeUrl,
            vCodec: "h264",
            vQuality: "720",
            aFormat: "mp3",
            isAudioOnly: false,
            isNoTTWatermark: true,
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] Cobalt response:", JSON.stringify(data).slice(0, 300));
          
          if (data.url) {
            const videoResponse = await fetch(data.url);
            if (videoResponse.ok) {
              const videoBuffer = await videoResponse.arrayBuffer();
              console.log(`[download-clip] Cobalt downloaded ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
              
              return new NextResponse(videoBuffer, {
                headers: {
                  "Content-Type": "video/mp4",
                  "Content-Disposition": `attachment; filename="clip-${videoId}-${start}-${end}.mp4"`,
                  "Content-Length": videoBuffer.byteLength.toString(),
                }
              });
            }
          }
        }
      } catch (e) {
        console.log(`[download-clip] Cobalt ${instance} error:`, e);
      }
    }

    // All methods failed - return helpful instructions
    return NextResponse.json({
      error: "YouTube download services are currently unavailable.",
      youtubeUrl: `${youtubeUrl}&t=${start}`,
      clipInfo: {
        videoId,
        startTime: start,
        endTime: end,
        duration: `${parseInt(end) - parseInt(start)} seconds`
      },
      instructions: [
        "1. Click the YouTube link above to open the video",
        "2. Use a browser extension like 'Video DownloadHelper' to download",
        "3. Or use yt-dlp on your computer: yt-dlp -f mp4 " + youtubeUrl,
        `4. Trim the video from ${start}s to ${end}s using any video editor`
      ]
    }, { status: 503 });
    
  } catch (error) {
    console.error("Download clip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download clip" },
      { status: 500 }
    );
  }
}
