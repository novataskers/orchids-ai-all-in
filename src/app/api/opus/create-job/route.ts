import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function getVideoInfo(videoId: string): Promise<{ title: string; duration: number; thumbnail: string }> {
  const defaultInfo = {
    title: "YouTube Video",
    duration: 0,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  };
  
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || defaultInfo.title,
        duration: 0,
        thumbnail: data.thumbnail_url || defaultInfo.thumbnail,
      };
    }
  } catch (e) {
    console.warn("Could not fetch video info:", e);
  }
  
  return defaultInfo;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      url, 
      clipDuration = 60, 
      maxClips = 5, 
      aspectRatio = "9:16",
      addCaptions = true,
      captionStyle = "bold"
    } = body;

    if (!url) {
      return NextResponse.json({ error: "No YouTube URL provided" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const videoInfo = await getVideoInfo(videoId);

    const { data: job, error } = await supabase
      .from("opus_jobs")
      .insert({
        youtube_url: youtubeUrl,
        video_id: videoId,
        video_title: videoInfo.title,
        video_duration: videoInfo.duration,
        thumbnail_url: videoInfo.thumbnail,
        status: "processing",
        current_step: "queued",
        progress: 5,
        clip_duration: clipDuration,
        max_clips: maxClips,
        aspect_ratio: aspectRatio,
        add_captions: addCaptions,
        caption_style: captionStyle,
      })
      .select()
      .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return NextResponse.json({
        success: true,
        jobId: job.id,
        videoInfo: {
          title: videoInfo.title,
          duration: videoInfo.duration,
          thumbnail: videoInfo.thumbnail,
          videoId,
        },
      });
    } catch (error) {
      console.error("Create job error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create job" },
        { status: 500 }
      );
    }
  }
