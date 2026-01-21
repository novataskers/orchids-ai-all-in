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
    const startSec = parseInt(start);
    const endSec = parseInt(end);
    
    console.log(`[download-clip] Downloading clip from ${youtubeUrl} (${startSec}s - ${endSec}s)`);

    // Try cobalt-api package
    try {
      console.log("[download-clip] Trying Cobalt API...");
      const CobaltAPI = (await import("cobalt-api")).default;
      const cobalt = new CobaltAPI(youtubeUrl);
      cobalt.setQuality("720");
      
      const result = await cobalt.sendRequest();
      console.log("[download-clip] Cobalt result:", JSON.stringify(result).slice(0, 300));
      
      if (result.status === "stream" || result.status === "redirect") {
        const videoUrl = result.url;
        console.log("[download-clip] Got video URL from Cobalt");
        
        const videoResponse = await fetch(videoUrl);
        if (videoResponse.ok) {
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
      }
    } catch (cobaltError) {
      console.log("[download-clip] Cobalt error:", cobaltError);
    }

    // Try direct Cobalt API endpoints
    const cobaltEndpoints = [
      "https://api.cobalt.tools",
      "https://co.wuk.sh",
    ];
    
    for (const endpoint of cobaltEndpoints) {
      try {
        console.log(`[download-clip] Trying Cobalt endpoint: ${endpoint}`);
        const response = await fetch(`${endpoint}/api/json`, {
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
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] Direct Cobalt response:", JSON.stringify(data).slice(0, 300));
          
          if (data.url) {
            const videoResponse = await fetch(data.url);
            if (videoResponse.ok) {
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
          }
        }
      } catch (e) {
        console.log(`[download-clip] Cobalt ${endpoint} error:`, e);
      }
    }

    // Fallback to RapidAPI ytstream
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
          console.log("[download-clip] ytstream response status:", data.status);
          
          if (data.formats && Array.isArray(data.formats)) {
            const mp4Format = data.formats
              .filter((f: any) => f.mimeType?.includes("video/mp4") && f.hasAudio && f.hasVideo)
              .sort((a: any, b: any) => (b.contentLength || 0) - (a.contentLength || 0))[0];
            
            if (mp4Format?.url) {
              console.log("[download-clip] Found ytstream format:", mp4Format.qualityLabel);
              const videoResponse = await fetch(mp4Format.url);
              
              if (videoResponse.ok) {
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
            }
          }
        }
      } catch (e) {
        console.log("[download-clip] ytstream error:", e);
      }
    }

    // All methods failed
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
    console.error("Download clip error:", error);
    
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
