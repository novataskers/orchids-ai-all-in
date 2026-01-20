import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type EngagingClip = {
  start: number;
  end: number;
  duration: number;
  text: string;
  score: number;
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function updateJob(jobId: string, updates: any) {
  try {
    const { error } = await supabase
      .from("opus_jobs")
      .update(updates)
      .eq("id", jobId);
    
    if (error) throw error;
  } catch (e) {
    console.error(`[opus] Error updating job ${jobId}:`, e);
  }
}

function findEngagingClips(segments: TranscriptSegment[], targetDuration: number, maxClips: number): EngagingClip[] {
  const clips: EngagingClip[] = [];
  
  // Simple heuristic: look for segments with "exciting" words or high information density
  // In a real app, you might use LLM to find best parts
  const excitingWords = ["wow", "amazing", "incredible", "crazy", "secret", "hack", "trick", "finally", "stop", "listen"];
  
  for (let i = 0; i < segments.length; i++) {
    let currentClipText = "";
    let startTime = segments[i].start;
    let endTime = segments[i].end;
    let score = 0;
    
    let j = i;
    while (j < segments.length && (segments[j].end - startTime) <= targetDuration) {
      const text = segments[j].text.toLowerCase();
      currentClipText += segments[j].text + " ";
      endTime = segments[j].end;
      
      // Scoring based on exciting words
      excitingWords.forEach(word => {
        if (text.includes(word)) score += 10;
      });
      
      // Scoring based on length (prefer clips closer to target duration)
      score += 1;
      
      j++;
    }
    
    if (currentClipText.trim().length > 50) {
      clips.push({
        start: startTime,
        end: endTime,
        duration: endTime - startTime,
        text: currentClipText.trim(),
        score: score
      });
    }
    
    // Skip ahead to avoid too much overlap
    i = j;
  }
  
  return clips
    .sort((a, b) => b.score - a.score)
    .slice(0, maxClips);
}

function prepareCookieFile(): string | null {
  const cookiesJson = process.env.YOUTUBE_COOKIES;
  if (!cookiesJson) return null;
  
  try {
    const cookies = JSON.parse(cookiesJson);
    const cookieFile = path.join(os.tmpdir(), `cookies_${Date.now()}.txt`);
    let cookieContent = "# Netscape HTTP Cookie File\n";
    for (const cookie of cookies) {
      cookieContent += `${cookie.domain}\t${cookie.expirationDate ? "TRUE" : "FALSE"}\t${cookie.path}\t${cookie.secure ? "TRUE" : "FALSE"}\t${cookie.expirationDate || 0}\t${cookie.name}\t${cookie.value}\n`;
    }
    fs.writeFileSync(cookieFile, cookieContent);
    console.log("[opus] Using YouTube cookies for authentication");
    return cookieFile;
  } catch (e) {
    console.warn("[opus] Failed to process YOUTUBE_COOKIES:", e);
    return null;
  }
}

async function downloadYouTubeAudio(videoId: string): Promise<Buffer> {
  console.log(`[opus] Downloading audio for video: ${videoId}`);
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputBase = path.join(os.tmpdir(), `audio_${videoId}_${Date.now()}`);
  const outputPath = `${outputBase}.mp3`;
  
  const ytdlpPath = fs.existsSync("/usr/local/bin/yt-dlp") ? "/usr/local/bin/yt-dlp" : "yt-dlp";
  console.log(`[opus] Using yt-dlp at: ${ytdlpPath}`);
  
  const cookieFile = prepareCookieFile();
  
  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--no-check-certificates",
    "--no-warnings",
    "--prefer-free-formats",
    "--add-header", "referer:youtube.com",
    "--add-header", "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-o", `${outputBase}.%(ext)s`,
  ];
  
  if (cookieFile) {
    args.push("--cookies", cookieFile);
  }
  
  args.push(youtubeUrl);
  
  try {
    await new Promise<void>((resolve, reject) => {
      console.log(`[opus] Running: ${ytdlpPath} ${args.join(" ")}`);
      const proc = spawn(ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      
      let stdout = "";
      let stderr = "";
      
      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });
      
      proc.on("close", (code) => {
        console.log(`[opus] yt-dlp stdout: ${stdout}`);
        if (stderr) console.log(`[opus] yt-dlp stderr: ${stderr}`);
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr || stdout}`));
        }
      });
      
      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
      });
    });

    if (!fs.existsSync(outputPath)) {
      const files = fs.readdirSync(os.tmpdir());
      const fallback = files.find(f => f.startsWith(path.basename(outputBase)));
      if (fallback) {
        const buffer = fs.readFileSync(path.join(os.tmpdir(), fallback));
        fs.unlinkSync(path.join(os.tmpdir(), fallback));
        if (cookieFile) fs.unlinkSync(cookieFile);
        return buffer;
      }
      throw new Error("Download failed: Output file not found");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    console.log(`[opus] Downloaded audio: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    fs.unlinkSync(outputPath);
    if (cookieFile) fs.unlinkSync(cookieFile);

    if (audioBuffer.length < 10000) {
      throw new Error(`File too small (${audioBuffer.length} bytes)`);
    }

    return audioBuffer;
  } catch (err) {
    console.error("[opus] yt-dlp error:", err);
    if (cookieFile && fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile);
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
