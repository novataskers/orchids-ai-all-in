import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const clipDuration = parseInt(formData.get("clipDuration") as string) || 60;
    const maxClips = parseInt(formData.get("maxClips") as string) || 5;
    const aspectRatio = (formData.get("aspectRatio") as string) || "9:16";
    const addCaptions = formData.get("addCaptions") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const validTypes = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];
    if (!validTypes.includes(file.type) && 
        !file.name.endsWith(".mp4") && 
        !file.name.endsWith(".mov") && 
        !file.name.endsWith(".mkv") &&
        !file.name.endsWith(".webm")) {
      return NextResponse.json({ error: "Invalid file type. Please upload MP4, MOV, MKV, or WebM." }, { status: 400 });
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 500MB." }, { status: 400 });
    }

    const fileId = uuidv4();
    const fileExt = file.name.split(".").pop() || "mp4";
    const fileName = `${fileId}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("opus-videos")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("opus-videos")
      .getPublicUrl(fileName);

    const fileUrl = urlData.publicUrl;

    const { data: job, error: jobError } = await supabase
      .from("opus_jobs")
      .insert({
        file_url: fileUrl,
        file_name: file.name,
        video_title: file.name.replace(/\.[^/.]+$/, ""),
        video_duration: 0,
        thumbnail_url: "",
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

    if (jobError) {
      throw new Error(`Database error: ${jobError.message}`);
    }

    processJobInBackground(job.id);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      videoInfo: {
        title: file.name.replace(/\.[^/.]+$/, ""),
        duration: 0,
        thumbnail: "",
        fileUrl,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

async function processJobInBackground(jobId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  fetch(`${baseUrl}/api/opus/process-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  }).catch((err) => {
    console.error("Failed to trigger background job:", err);
  });
}
