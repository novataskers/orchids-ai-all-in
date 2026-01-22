import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { VizardClient } from "@/lib/vizard";

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

  // If using Vizard and still processing, check Vizard status
  if (job.vizard_project_id && (job.status === "processing" || job.status === "pending")) {
    try {
      const vizard = new VizardClient();
      const vizardStatus = await vizard.queryProject(job.vizard_project_id);

      if (vizardStatus.status === "completed" && vizardStatus.videos) {
        const generatedClips = vizardStatus.videos.map((clip: any, idx: number) => ({
          id: idx + 1,
          filename: clip.title || `clip_${idx + 1}.mp4`,
          downloadUrl: clip.videoUrl,
          thumbnailUrl: `https://img.youtube.com/vi/${job.video_id}/mqdefault.jpg`,
          start: 0, // Vizard clips don't have start/end relative to original easily accessible in query
          end: clip.videoMsDuration / 1000,
          duration: clip.videoMsDuration / 1000,
          text: clip.transcript,
          score: parseFloat(clip.viralScore) * 10,
          vizardUrl: clip.clipEditorUrl
        }));

        const updates = {
          status: "completed",
          current_step: "done",
          progress: 100,
          clips: {
            items: generatedClips,
            videoId: job.video_id,
            youtubeUrl: job.youtube_url,
            vizardProjectId: job.vizard_project_id
          },
          updated_at: new Date().toISOString()
        };

        await supabase.from("opus_jobs").update(updates).eq("id", jobId);
        
        // Return the updated data
        return NextResponse.json({
          ...job,
          ...updates,
          jobId: job.id,
          videoInfo: {
            title: job.video_title || job.file_name || "Video",
            duration: job.video_duration,
            thumbnail: job.thumbnail_url,
            videoId: job.video_id,
            fileUrl: job.file_url,
          }
        });
      } else if (vizardStatus.status === "failed") {
        const updates = {
          status: "failed",
          current_step: "error",
          error_message: vizardStatus.error || "Vizard processing failed",
          updated_at: new Date().toISOString()
        };
        await supabase.from("opus_jobs").update(updates).eq("id", jobId);
        return NextResponse.json({ ...job, ...updates });
      }
    } catch (vizardError) {
      console.error("[opus] Vizard status check error:", vizardError);
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
