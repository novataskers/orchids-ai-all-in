import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { YtDlp } from "ytdlp-nodejs";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ytdlp = new YtDlp();

async function updateJob(jobId: string, updates: Record<string, unknown>) {
  await supabase
    .from("opus_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type ClipInfo = {
  id: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  score: number;
};

function findEngagingClips(
  segments: TranscriptSegment[],
  clipDuration: number,
  maxClips: number
): ClipInfo[] {
  if (segments.length === 0) return [];

  const clips: ClipInfo[] = [];
  const totalDuration = segments[segments.length - 1].end;

  const engagementKeywords = [
    "secret", "amazing", "incredible", "shocking", "important", "key", "tip",
    "trick", "hack", "must", "need", "should", "best", "worst", "never", "always",
    "mistake", "success", "fail", "win", "lose", "money", "free", "easy", "hard",
    "simple", "quick", "fast", "how to", "why", "what if", "imagine", "think about",
    "listen", "watch", "look", "here's", "this is", "the truth", "actually",
    "believe", "crazy", "insane", "mind", "blow", "game changer", "life changing"
  ];

  const questionIndicators = ["?", "how", "why", "what", "when", "where", "who", "which"];
  const emotionalWords = ["love", "hate", "fear", "hope", "dream", "angry", "happy", "sad", "excited"];

  function scoreSegment(text: string): number {
    let score = 0;
    const lowerText = text.toLowerCase();

    for (const keyword of engagementKeywords) {
      if (lowerText.includes(keyword)) score += 2;
    }

    for (const q of questionIndicators) {
      if (lowerText.includes(q)) score += 1.5;
    }

    for (const emotion of emotionalWords) {
      if (lowerText.includes(emotion)) score += 1;
    }

    if (text.includes("!")) score += 0.5;

    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 50) score += 1;

    return score;
  }

  let currentStart = 0;
  while (currentStart < totalDuration) {
    const clipEnd = Math.min(currentStart + clipDuration, totalDuration);

    const clipSegments = segments.filter(
      (seg) => seg.start >= currentStart && seg.end <= clipEnd
    );

    if (clipSegments.length > 0) {
      const clipText = clipSegments.map((s) => s.text).join(" ");
      const score = scoreSegment(clipText);

      clips.push({
        id: clips.length,
        start: currentStart,
        end: clipEnd,
        duration: clipEnd - currentStart,
        text: clipText,
        score,
      });
    }

    currentStart += clipDuration * 0.5;
  }

  clips.sort((a, b) => b.score - a.score);

  const selectedClips: ClipInfo[] = [];
  for (const clip of clips) {
    if (selectedClips.length >= maxClips) break;

    const overlaps = selectedClips.some(
      (selected) =>
        (clip.start >= selected.start && clip.start < selected.end) ||
        (clip.end > selected.start && clip.end <= selected.end)
    );

    if (!overlaps) {
      selectedClips.push(clip);
    }
  }

  selectedClips.sort((a, b) => a.start - b.start);

  return selectedClips.map((clip, idx) => ({
    ...clip,
    id: idx + 1,
  }));
}

async function downloadYouTubeAudio(videoId: string): Promise<Buffer> {
  console.log(`[opus] Downloading audio for video: ${videoId}`);
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `opus_${videoId}_${Date.now()}.mp3`);
  
  try {
    console.log(`[opus] Using yt-dlp to download audio...`);
    
    await ytdlp.downloadAsync(youtubeUrl, {
      format: { filter: "audioonly", quality: "highest" },
      output: outputPath,
      extractAudio: true,
      audioFormat: "mp3",
      onProgress: (progress: { percent?: number }) => {
        if (progress.percent) {
          console.log(`[opus] Download progress: ${progress.percent.toFixed(1)}%`);
        }
      },
    });
    
    if (!fs.existsSync(outputPath)) {
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`opus_${videoId}`));
      if (files.length > 0) {
        const actualPath = path.join(tempDir, files[0]);
        const audioBuffer = fs.readFileSync(actualPath);
        fs.unlinkSync(actualPath);
        console.log(`[opus] Downloaded audio: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        return audioBuffer;
      }
      throw new Error("Download completed but file not found");
    }
    
    const audioBuffer = fs.readFileSync(outputPath);
    fs.unlinkSync(outputPath);
    
    if (audioBuffer.length < 10000) {
      throw new Error(`Downloaded file too small (${audioBuffer.length} bytes)`);
    }
    
    console.log(`[opus] Downloaded audio via yt-dlp: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    return audioBuffer;
    
  } catch (ytdlpError) {
    console.log(`[opus] yt-dlp failed: ${ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError)}`);
    
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    
    console.log(`[opus] Trying fallback RapidAPI...`);
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    
    if (rapidApiKey) {
      try {
        const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
          headers: {
            "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
            "x-rapidapi-key": rapidApiKey,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.status === "processing") {
            console.log(`[opus] RapidAPI processing, polling...`);
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 4000));
              const retryRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
                headers: { "x-rapidapi-host": "youtube-mp36.p.rapidapi.com", "x-rapidapi-key": rapidApiKey }
              });
              const retryData = await retryRes.json();
              if (retryData.status === "ok" && retryData.link) {
                const audioRes = await fetch(retryData.link);
                if (audioRes.ok) {
                  const buf = Buffer.from(await audioRes.arrayBuffer());
                  if (buf.length > 10000) {
                    console.log(`[opus] Downloaded via RapidAPI fallback: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
                    return buf;
                  }
                }
              }
              if (retryData.status === "fail") break;
            }
          }
          
          if (data.status === "ok" && data.link) {
            const audioRes = await fetch(data.link);
            if (audioRes.ok) {
              const buf = Buffer.from(await audioRes.arrayBuffer());
              if (buf.length > 10000) {
                console.log(`[opus] Downloaded via RapidAPI fallback: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
                return buf;
              }
            }
          }
        }
      } catch (e) {
        console.log(`[opus] RapidAPI fallback also failed: ${e}`);
      }
    }
    
    throw new Error(`Failed to download audio: ${ytdlpError instanceof Error ? ytdlpError.message : String(ytdlpError)}`);
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
