import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { youtubeDl } from "yt-dlp-exec";
import path from "path";
import fs from "fs";
import os from "os";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function getDownloadArgs() {
  const cookiesJson = process.env.YOUTUBE_COOKIES;
  const proxyUri = process.env.YOUTUBE_PROXY;
  const args: Record<string, any> = {
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: 0,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      "referer:youtube.com",
      "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ]
  };

  if (cookiesJson) {
    try {
      const cookies = JSON.parse(cookiesJson);
      const cookieFile = path.join(os.tmpdir(), `cookies_${Date.now()}.txt`);
      let cookieContent = "# Netscape HTTP Cookie File\n";
      for (const cookie of cookies) {
        cookieContent += `${cookie.domain}\t${cookie.expirationDate ? "TRUE" : "FALSE"}\t${cookie.path}\t${cookie.secure ? "TRUE" : "FALSE"}\t${cookie.expirationDate || 0}\t${cookie.name}\t${cookie.value}\n`;
      }
      fs.writeFileSync(cookieFile, cookieContent);
      args.cookies = cookieFile;
      console.log("[opus] Using YouTube cookies for authentication");
    } catch (e) {
      console.warn("[opus] Failed to process YOUTUBE_COOKIES:", e);
    }
  }

  if (proxyUri) {
    args.proxy = proxyUri;
    console.log("[opus] Using proxy for download");
  }

  return args;
}

async function downloadYouTubeAudio(videoId: string): Promise<Buffer> {
  console.log(`[opus] Downloading audio for video: ${videoId}`);
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputBase = path.join(os.tmpdir(), `audio_${videoId}_${Date.now()}`);
  const outputPath = `${outputBase}.mp3`;
  
  try {
    const args = getDownloadArgs();
    await youtubeDl(youtubeUrl, {
      ...args,
      output: outputBase + ".%(ext)s",
    });

    if (!fs.existsSync(outputPath)) {
      // Sometimes yt-dlp might use a different extension if conversion fails
      const files = fs.readdirSync(os.tmpdir());
      const fallback = files.find(f => f.startsWith(path.basename(outputBase)));
      if (fallback) {
        const buffer = fs.readFileSync(path.join(os.tmpdir(), fallback));
        // Clean up
        fs.unlinkSync(path.join(os.tmpdir(), fallback));
        if (args.cookies) fs.unlinkSync(args.cookies as string);
        return buffer;
      }
      throw new Error("Download failed: Output file not found");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    console.log(`[opus] Downloaded audio: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Clean up
    fs.unlinkSync(outputPath);
    if (args.cookies) fs.unlinkSync(args.cookies as string);

    if (audioBuffer.length < 10000) {
      throw new Error(`File too small (${audioBuffer.length} bytes)`);
    }

    return audioBuffer;
  } catch (err) {
    console.error("[opus] yt-dlp error:", err);
    throw new Error(`Failed to download audio: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function transcribeWithWhisper(audioBuffer: Buffer): Promise<TranscriptSegment[]> {
  console.log(`[opus] Transcribing audio with Groq Whisper...`);
  
  const maxSize = 25 * 1024 * 1024;
  let bufferToTranscribe = audioBuffer;
  
  if (audioBuffer.length > maxSize) {
    console.log(`[opus] Audio too large (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB), truncating to 25MB`);
    bufferToTranscribe = audioBuffer.slice(0, maxSize);
  }
  
  const file = new File([bufferToTranscribe], "audio.mp3", { type: "audio/mpeg" });
  
  const transcription = await groq.audio.transcriptions.create({
    file: file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    language: "en",
  });
  
  console.log(`[opus] Transcription complete`);
  
  type WhisperSegment = {
    start: number;
    end: number;
    text: string;
  };
  
  const segments: TranscriptSegment[] = [];
  
  if (transcription.segments && Array.isArray(transcription.segments)) {
    (transcription.segments as WhisperSegment[]).forEach((seg, idx) => {
      segments.push({
        id: idx,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
      });
    });
  } else if (transcription.text) {
    const words = transcription.text.split(/\s+/);
    const wordsPerSegment = 20;
    const estimatedDuration = 300;
    const segmentDuration = estimatedDuration / Math.ceil(words.length / wordsPerSegment);
    
    for (let i = 0; i < words.length; i += wordsPerSegment) {
      const segmentWords = words.slice(i, i + wordsPerSegment);
      const segmentIndex = Math.floor(i / wordsPerSegment);
      segments.push({
        id: segmentIndex,
        start: segmentIndex * segmentDuration,
        end: (segmentIndex + 1) * segmentDuration,
        text: segmentWords.join(" "),
      });
    }
  }
  
  return segments;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "No job ID provided" }, { status: 400 });
    }

    console.log("[opus/process-job] Processing job:", jobId);

    const { data: job, error } = await supabase
      .from("opus_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    try {
      const videoId = job.video_id;
      if (!videoId) {
        throw new Error("No video ID found for this job");
      }

      await updateJob(jobId, { status: "processing", current_step: "downloading_audio", progress: 10 });

      const audioBuffer = await downloadYouTubeAudio(videoId);

      await updateJob(jobId, { current_step: "transcribing", progress: 30 });
      
      const segments = await transcribeWithWhisper(audioBuffer);
      const fullText = segments.map(s => s.text).join(" ");

      console.log(`[opus] Got ${segments.length} transcript segments`);

      await updateJob(jobId, { 
        current_step: "finding_clips", 
        progress: 60,
        transcription: { text: fullText, segments }
      });

      const engagingClips = findEngagingClips(segments, job.clip_duration, job.max_clips);

      if (engagingClips.length === 0) {
        throw new Error("Could not find suitable clips in the video");
      }

      console.log(`[opus] Found ${engagingClips.length} engaging clips`);

      await updateJob(jobId, { current_step: "generating_clips", progress: 80 });

      const generatedClips = engagingClips.map((clip, idx) => {
        const startTime = Math.floor(clip.start);
        const endTime = Math.ceil(clip.end);
        
        return {
          id: idx + 1,
          filename: `clip_${idx + 1}_${startTime}s-${endTime}s.mp4`,
          downloadUrl: `https://www.youtube.com/watch?v=${videoId}&t=${startTime}`,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          start: clip.start,
          end: clip.end,
          duration: clip.duration,
          text: clip.text,
          score: clip.score,
          cobaltUrl: buildCobaltDownloadUrl(videoId, startTime, endTime),
        };
      });

      await updateJob(jobId, {
        status: "completed",
        current_step: "done",
        progress: 100,
        clips: {
          items: generatedClips,
          videoId: videoId,
          youtubeUrl: job.youtube_url,
        },
      });

      return NextResponse.json({ success: true, jobId });

    } catch (processError) {
      console.error("Job processing error:", processError);
      await updateJob(jobId, {
        status: "failed",
        current_step: "error",
        error_message: processError instanceof Error ? processError.message : "Processing failed",
      });

      return NextResponse.json(
        { error: processError instanceof Error ? processError.message : "Processing failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Process job error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process job" },
      { status: 500 }
    );
  }
}

function buildCobaltDownloadUrl(videoId: string, start: number, end: number): string {
  return `/api/opus/download-clip?videoId=${videoId}&start=${start}&end=${end}`;
}

export const maxDuration = 300;
