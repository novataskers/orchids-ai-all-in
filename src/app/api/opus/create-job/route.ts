import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const isProduction = process.env.NODE_ENV === "production";
const BIN_DIR = isProduction ? "/tmp/bin" : path.join(process.cwd(), "bin");
const YTDLP_PATH = isProduction ? "/tmp/bin/yt-dlp" : path.join(BIN_DIR, "yt-dlp.exe");

async function ensureYtdlp(): Promise<YTDlpWrap> {
  if (!existsSync(BIN_DIR)) {
    await mkdir(BIN_DIR, { recursive: true });
  }
  
  if (!existsSync(YTDLP_PATH)) {
    await YTDlpWrap.downloadFromGithub(YTDLP_PATH);
  }
  
  return new YTDlpWrap(YTDLP_PATH);
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      url, 
      clipDuration = 60, 
      maxClips = 5, 
      aspectRatio = "9:16",
      addCaptions = true 
    } = body;

    if (!url) {
      return NextResponse.json({ error: "No YouTube URL provided" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    let title = "YouTube Video";
    let duration = 0;
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    try {
      const ytdlp = await ensureYtdlp();
      const metadata = await ytdlp.getVideoInfo(youtubeUrl);
      title = metadata.title || title;
      duration = metadata.duration || 0;
      thumbnail = metadata.thumbnail || thumbnail;
    } catch (e) {
      console.warn("Could not fetch video info, using defaults:", e);
    }

    const { data: job, error } = await supabase
      .from("opus_jobs")
      .insert({
        youtube_url: youtubeUrl,
        video_id: videoId,
        video_title: title,
        video_duration: duration,
        thumbnail_url: thumbnail,
        status: "processing",
        current_step: "queued",
        progress: 5,
        clip_duration: clipDuration,
        max_clips: maxClips,
        aspect_ratio: aspectRatio,
        add_captions: addCaptions,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    processJobInBackground(job.id);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      videoInfo: {
        title,
        duration,
        thumbnail,
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

async function processJobInBackground(jobId: string) {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || "localhost:3000";
  const baseUrl = host.startsWith("http") ? host : `${protocol}://${host}`;
  
  console.log(`[opus] Triggering background job: ${baseUrl}/api/opus/process-job for job ${jobId}`);
  
  fetch(`${baseUrl}/api/opus/process-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  })
    .then((res) => {
      console.log(`[opus] Background job response: ${res.status}`);
    })
    .catch((err) => {
      console.error("[opus] Failed to trigger background job:", err);
    });
}
