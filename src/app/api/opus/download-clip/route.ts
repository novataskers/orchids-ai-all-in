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
    
    // Try youtube-video-download-info API which provides working download links
    if (process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying youtube-video-download-info API...");
        const response = await fetch(`https://youtube-video-download-info.p.rapidapi.com/dl?id=${videoId}`, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "youtube-video-download-info.p.rapidapi.com"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] API response:", JSON.stringify(data).slice(0, 500));
          
          if (data.link) {
            // This API returns direct download links
            for (const format of data.link) {
              if (format[0]?.includes("mp4") && format[1]) {
                console.log("[download-clip] Found direct link, proxying...");
                const videoResponse = await fetch(format[1], {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  }
                });
                
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
        }
      } catch (e) {
        console.log("[download-clip] youtube-video-download-info error:", e);
      }
    }

    // Try SaveFrom-style API
    if (process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying savefrom API...");
        const response = await fetch("https://savefrom-anywhere-link-video-image-downloader.p.rapidapi.com/savefrom.php", {
          method: "POST",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "savefrom-anywhere-link-video-image-downloader.p.rapidapi.com",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: `url=${encodeURIComponent(youtubeUrl)}`
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] SaveFrom response:", JSON.stringify(data).slice(0, 500));
          
          if (data.video && Array.isArray(data.video)) {
            const mp4Video = data.video.find((v: any) => v.url && v.ext === "mp4");
            if (mp4Video?.url) {
              console.log("[download-clip] Found SaveFrom link, proxying...");
              const videoResponse = await fetch(mp4Video.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
              });
              
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
        console.log("[download-clip] SaveFrom error:", e);
      }
    }

    // Try social-download-all API
    if (process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying social-download-all API...");
        const response = await fetch(`https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink?url=${encodeURIComponent(youtubeUrl)}`, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "social-download-all-in-one.p.rapidapi.com"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] social-download response:", JSON.stringify(data).slice(0, 500));
          
          if (data.medias && Array.isArray(data.medias)) {
            const mp4Media = data.medias.find((m: any) => m.url && m.extension === "mp4" && m.videoAvailable);
            if (mp4Media?.url) {
              console.log("[download-clip] Found social-download link, proxying...");
              const videoResponse = await fetch(mp4Media.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
              });
              
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
        console.log("[download-clip] social-download error:", e);
      }
    }

    // All methods failed
    return NextResponse.json({
      error: "Could not download video. YouTube is blocking access.",
      youtubeUrl: `${youtubeUrl}&t=${start}`,
      manualInstructions: `Use a YouTube downloader site like y2mate.com or ssyoutube.com to download the video, then trim to ${start}s - ${end}s`
    }, { status: 503 });
    
  } catch (error) {
    console.error("Download clip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download clip" },
      { status: 500 }
    );
  }
}
