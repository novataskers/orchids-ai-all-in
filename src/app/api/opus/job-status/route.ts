import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "No job ID provided" }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("opus_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    currentStep: job.current_step,
    progress: job.progress,
    videoInfo: {
      title: job.video_title || job.file_name || "Video",
      duration: job.video_duration,
      thumbnail: job.thumbnail_url,
      videoId: job.video_id,
      fileUrl: job.file_url,
    },
    transcription: job.transcription,
    clips: job.clips,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
}
