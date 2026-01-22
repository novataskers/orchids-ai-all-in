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

    // If job is processing and has a klap_id, poll Klap.app
    if (job.status === "processing" && job.klap_id) {
      try {
        console.log(`[opus] Polling Klap.app status for job: ${job.klap_id}`);
        const klapResponse = await fetch(`https://api.klap.app/v1/jobs/${job.klap_id}`, {
          headers: {
            "x-api-key": process.env.KLAP_API_KEY!,
          },
        });

        if (klapResponse.ok) {
          const klapData = await klapResponse.json();
          console.log(`[opus] Klap status: ${klapData.status}`);

          if (klapData.status === "completed" && klapData.data?.clips) {
            const klapClips = klapData.data.clips;
            const generatedClips = klapClips.map((clip: any, idx: number) => ({
              id: idx + 1,
              filename: `clip_${idx + 1}.mp4`,
              downloadUrl: clip.video_url,
              thumbnailUrl: clip.thumbnail_url || job.thumbnail_url,
              start: clip.start || 0,
              end: clip.end || 0,
              duration: (clip.end || 0) - (clip.start || 0),
              text: clip.title || clip.text || "",
              score: clip.score || 10,
              klap_clip_id: clip.id
            }));

            await supabase
              .from("opus_jobs")
              .update({
                status: "completed",
                current_step: "done",
                progress: 100,
                clips: {
                  items: generatedClips,
                  videoId: job.video_id,
                  youtubeUrl: job.youtube_url,
                },
              })
              .eq("id", jobId);
            
            // Refresh job data
            job.status = "completed";
            job.current_step = "done";
            job.progress = 100;
            job.clips = { items: generatedClips, videoId: job.video_id, youtubeUrl: job.youtube_url };
          } else if (klapData.status === "failed") {
            await supabase
              .from("opus_jobs")
              .update({
                status: "failed",
                current_step: "error",
                error_message: klapData.error || "Klap.app processing failed",
              })
              .eq("id", jobId);
            
            job.status = "failed";
            job.current_step = "error";
            job.error_message = klapData.error || "Klap.app processing failed";
          }
        }
      } catch (e) {
        console.error("[opus] Error polling Klap.app:", e);
      }
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
