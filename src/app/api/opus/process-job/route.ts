import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

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
      
      excitingWords.forEach(word => {
        if (text.includes(word)) score += 10;
      });
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
    i = j;
  }
  
  return clips
    .sort((a, b) => b.score - a.score)
    .slice(0, maxClips);
}

async function downloadYouTubeAudio(videoId: string): Promise<Buffer> {
  console.log(`[opus] Downloading audio for video: ${videoId}`);
  
  // Method 1: Try youtube-mp36 RapidAPI (WORKING - tested)
  if (process.env.RAPIDAPI_KEY) {
    try {
      console.log("[opus] Trying youtube-mp36 API...");
      const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
        method: "GET",
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
          "x-rapidapi-host": "youtube-mp36.p.rapidapi.com"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("[opus] youtube-mp36 response:", JSON.stringify(data).slice(0, 300));
        
        if (data.status === "ok" && data.link) {
          console.log(`[opus] Got download URL from youtube-mp36`);
          
          const audioResponse = await fetch(data.link);
          if (audioResponse.ok) {
            const arrayBuffer = await audioResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`[opus] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB via youtube-mp36`);
            
            if (buffer.length > 10000) {
              return buffer;
            }
          }
        }
      }
      console.log("[opus] youtube-mp36 method failed, trying alternatives...");
    } catch (e) {
      console.log("[opus] youtube-mp36 error:", e);
    }
  }
  
  // Method 2: Try ytstream RapidAPI
  if (process.env.RAPIDAPI_KEY) {
    try {
      console.log("[opus] Trying ytstream API...");
      const response = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
        method: "GET",
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
          "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("[opus] ytstream response:", JSON.stringify(data).slice(0, 300));
        
        if (data.status === "OK" && data.adaptiveFormats) {
          const audioFormat = data.adaptiveFormats.find((f: any) => 
            f.mimeType?.includes("audio") && f.url
          );
          
          if (audioFormat?.url) {
            console.log(`[opus] Got audio URL from ytstream`);
            const audioResponse = await fetch(audioFormat.url);
            if (audioResponse.ok) {
              const arrayBuffer = await audioResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              console.log(`[opus] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB via ytstream`);
              
              if (buffer.length > 10000) {
                return buffer;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("[opus] ytstream error:", e);
    }
  }

  // Method 3: Try yt-api RapidAPI
  if (process.env.RAPIDAPI_KEY) {
    try {
      console.log("[opus] Trying yt-api...");
      const response = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
        method: "GET",
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
          "x-rapidapi-host": "yt-api.p.rapidapi.com"
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("[opus] yt-api response:", JSON.stringify(data).slice(0, 300));
        
        if (data.adaptiveFormats) {
          const audioFormat = data.adaptiveFormats.find((f: any) => 
            f.mimeType?.includes("audio") && f.url
          );
          
          if (audioFormat?.url) {
            const audioResponse = await fetch(audioFormat.url);
            if (audioResponse.ok) {
              const arrayBuffer = await audioResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              console.log(`[opus] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB via yt-api`);
              
              if (buffer.length > 10000) {
                return buffer;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("[opus] yt-api error:", e);
    }
  }

  throw new Error("All download methods failed. Please check your RapidAPI subscription or try a different video.");
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
