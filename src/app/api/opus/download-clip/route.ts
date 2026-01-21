import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

function parseCookies(): string {
  try {
    const cookiesJson = process.env.YOUTUBE_COOKIES;
    if (!cookiesJson) return "";
    
    const cookies = JSON.parse(cookiesJson);
    return cookies
      .map((c: any) => `${c.name}=${c.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

async function getYouTubeVideoInfo(videoId: string, cookieString: string) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cookie": cookieString,
    }
  });
  
  const html = await response.text();
  
  const playerResponseMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});/s);
  if (!playerResponseMatch) {
    const configMatch = html.match(/ytInitialPlayerResponse"\s*:\s*({.+?})\s*,\s*"/s);
    if (configMatch) {
      return JSON.parse(configMatch[1]);
    }
    throw new Error("Could not find player response");
  }
  
  return JSON.parse(playerResponseMatch[1]);
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
    const cookieString = parseCookies();
    
    console.log("[download-clip] Cookie available:", cookieString.length > 0);

    // Try direct YouTube extraction with cookies
    if (cookieString) {
      try {
        console.log("[download-clip] Trying direct YouTube extraction with cookies...");
        const playerResponse = await getYouTubeVideoInfo(videoId, cookieString);
        
        if (playerResponse.streamingData) {
          const { formats, adaptiveFormats } = playerResponse.streamingData;
          
          // Look for combined format (video + audio)
          const allFormats = [...(formats || []), ...(adaptiveFormats || [])];
          
          // Prefer formats with both video and audio
          let selectedFormat = allFormats.find(
            (f: any) => f.mimeType?.includes("video/mp4") && f.audioQuality && f.url
          );
          
          // Fallback to any mp4 with URL
          if (!selectedFormat) {
            selectedFormat = allFormats.find(
              (f: any) => f.mimeType?.includes("video/mp4") && f.url
            );
          }
          
          if (selectedFormat?.url) {
            console.log("[download-clip] Found format:", selectedFormat.qualityLabel || selectedFormat.quality);
            
            const videoResponse = await fetch(selectedFormat.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Cookie": cookieString,
                "Range": "bytes=0-",
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
          
          // Try signatureCipher formats (need to decode)
          const cipherFormat = allFormats.find(
            (f: any) => f.mimeType?.includes("video/mp4") && f.signatureCipher
          );
          
          if (cipherFormat?.signatureCipher) {
            console.log("[download-clip] Found cipher format, but decoding not implemented");
          }
        }
      } catch (e) {
        console.log("[download-clip] Direct extraction error:", e);
      }
    }

    // Try ytstream API
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
              const videoResponse = await fetch(mp4Format.url, {
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
        console.log("[download-clip] ytstream error:", e);
      }
    }

    // Try yt-api API
    if (process.env.RAPIDAPI_KEY) {
      try {
        console.log("[download-clip] Trying yt-api...");
        const response = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "yt-api.p.rapidapi.com"
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[download-clip] yt-api response:", JSON.stringify(data).slice(0, 300));
          
          if (data.formats) {
            const mp4Format = data.formats.find((f: any) => 
              f.mimeType?.includes("video/mp4") && f.url
            );
            
            if (mp4Format?.url) {
              const videoResponse = await fetch(mp4Format.url);
              if (videoResponse.ok) {
                const videoBuffer = await videoResponse.arrayBuffer();
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
        console.log("[download-clip] yt-api error:", e);
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
