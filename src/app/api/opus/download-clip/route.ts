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
    
    const cobaltInstances = [
      "https://api.cobalt.tools",
      "https://cobalt-api.kwiatekmiki.com",
      "https://cobalt.api.timelessnesses.me",
    ];

    let downloadUrl: string | null = null;

    for (const instance of cobaltInstances) {
      try {
        const response = await fetch(`${instance}/api/json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            url: youtubeUrl,
            vCodec: "h264",
            vQuality: "720",
            aFormat: "mp3",
            isAudioOnly: false,
            isNoTTWatermark: true,
            isTTFullAudio: false,
            disableMetadata: false,
          }),
        });

        if (!response.ok) continue;
        
        const data = await response.json();
        
        if (data.status === "error") continue;
        
        downloadUrl = data.url;
        if (downloadUrl) break;
      } catch (e) {
        console.log(`Cobalt instance ${instance} failed:`, e);
        continue;
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
