import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import YTDlpWrap from "yt-dlp-wrap";
import Groq from "groq-sdk";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, unlink, readFile } from "fs/promises";
import { existsSync, createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  if (process.env.NODE_ENV === "production") {
    return "ffmpeg";
  }
  const wingetPath = "C:\\Users\\jihan\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe";
  if (existsSync(wingetPath)) {
    return wingetPath;
  }
  return "ffmpeg";
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const BIN_DIR = isProduction ? "/tmp/bin" : path.join(process.cwd(), "bin");
const YTDLP_PATH = isProduction ? "/tmp/bin/yt-dlp" : path.join(BIN_DIR, "yt-dlp.exe");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function ensureYtdlp(): Promise<YTDlpWrap> {
  await ensureDir(BIN_DIR);
  
  if (!existsSync(YTDLP_PATH)) {
    await YTDlpWrap.downloadFromGithub(YTDLP_PATH);
  }
  
  return new YTDlpWrap(YTDLP_PATH);
}

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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

async function createZip(files: string[], zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    for (const file of files) {
      archive.file(file, { name: path.basename(file) });
    }

    archive.finalize();
  });
}

export async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      console.log("[opus/process-job] Received body:", body);
      const { jobId } = body;

      if (!jobId) {
        console.log("[opus/process-job] No jobId in body");
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

    const sessionDir = path.join(TMP_BASE, "opus-jobs", jobId);
    await ensureDir(sessionDir);

    try {
      await updateJob(jobId, { current_step: "downloading_audio", progress: 10 });

      const ytdlp = await ensureYtdlp();
      const youtubeUrl = job.youtube_url;

      if (!youtubeUrl) {
        throw new Error("No YouTube URL found for this job");
      }

      const audioPath = path.join(sessionDir, "audio.m4a");
      
      await ytdlp.execPromise([
        youtubeUrl,
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", audioPath,
        "--no-playlist",
        "--no-warnings"
      ]);

await updateJob(jobId, { current_step: "transcribing", progress: 30 });

        const mp3Path = path.join(sessionDir, "audio.mp3");
        await execFileAsync(getFfmpegPath(), [
          "-y", "-i", audioPath, "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "32k", mp3Path
        ]);

        const audioBuffer = await readFile(mp3Path);
        
        const MAX_FILE_SIZE = 24 * 1024 * 1024;
        let segments: TranscriptSegment[] = [];
        
        if (audioBuffer.length > MAX_FILE_SIZE) {
          console.log(`[opus] Audio file too large (${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB), splitting into chunks...`);
          
          const { stdout: durationStr } = await execFileAsync(getFfmpegPath(), [
            "-i", mp3Path, "-f", "null", "-"
          ]).catch(() => ({ stdout: "", stderr: "" }));
          
          const durationMatch = job.video_duration || 300;
          const chunkDuration = 300;
          const numChunks = Math.ceil(durationMatch / chunkDuration);
          
          for (let i = 0; i < numChunks; i++) {
            const startTime = i * chunkDuration;
            const chunkPath = path.join(sessionDir, `chunk_${i}.mp3`);
            
            await execFileAsync(getFfmpegPath(), [
              "-y", "-i", mp3Path, "-ss", String(startTime), "-t", String(chunkDuration),
              "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "32k", chunkPath
            ]);
            
            const chunkBuffer = await readFile(chunkPath);
            const chunkFile = new File([chunkBuffer], `chunk_${i}.mp3`, { type: "audio/mpeg" });
            
            const transcription = await groq.audio.transcriptions.create({
              file: chunkFile,
              model: "whisper-large-v3-turbo",
              response_format: "verbose_json",
              timestamp_granularities: ["segment"],
            });
            
            const chunkSegments: TranscriptSegment[] = (transcription.segments || []).map((seg, idx) => ({
              id: segments.length + idx,
              start: seg.start + startTime,
              end: seg.end + startTime,
              text: seg.text.trim(),
            }));
            
            segments = [...segments, ...chunkSegments];
            
            try { await unlink(chunkPath); } catch {}
            
            const transcribeProgress = 30 + Math.floor((i + 1) / numChunks * 15);
            await updateJob(jobId, { progress: transcribeProgress });
          }
        } else {
          const audioFile = new File([audioBuffer], "audio.mp3", { type: "audio/mpeg" });

          const transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-large-v3-turbo",
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
          });

          segments = (transcription.segments || []).map((seg, idx) => ({
            id: idx,
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
          }));
        }
        
        const fullText = segments.map(s => s.text).join(" ");
        
        try { await unlink(mp3Path); } catch {}

      await updateJob(jobId, { 
        current_step: "finding_clips", 
        progress: 50,
        transcription: { text: fullText, segments }
      });

      const engagingClips = findEngagingClips(segments, job.clip_duration, job.max_clips);

      if (engagingClips.length === 0) {
        throw new Error("Could not find suitable clips in the video");
      }

      await updateJob(jobId, { current_step: "downloading_video", progress: 60 });

      const videoPath = path.join(sessionDir, "video.mp4");
      
      await ytdlp.execPromise([
        youtubeUrl,
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "-o", videoPath,
        "--no-playlist",
        "--no-warnings",
        "--merge-output-format", "mp4"
      ]);

      await updateJob(jobId, { current_step: "cutting_clips", progress: 70 });

const generatedClips: Array<{
          id: number;
          filename: string;
          downloadUrl: string;
          thumbnailUrl: string;
          start: number;
          end: number;
          duration: number;
          text: string;
          score: number;
        }> = [];

        const aspectRatio = job.aspect_ratio || "9:16";
        let scaleFilter = "";
        if (aspectRatio === "9:16") {
          scaleFilter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1";
        } else if (aspectRatio === "16:9") {
          scaleFilter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1";
        }

        for (let i = 0; i < engagingClips.length; i++) {
          const clip = engagingClips[i];
          const filename = `clip_${clip.id}_${Math.floor(clip.start)}s.mp4`;
          const outputPath = path.join(sessionDir, filename);
          const thumbFilename = `thumb_${clip.id}.jpg`;
          const thumbPath = path.join(sessionDir, thumbFilename);

          const ffmpegArgs = [
            "-y", "-ss", formatTime(clip.start), "-i", videoPath, "-t", String(clip.duration),
            "-vf", scaleFilter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            outputPath
          ];

          await execFileAsync(getFfmpegPath(), ffmpegArgs);

          await execFileAsync(getFfmpegPath(), [
            "-y", "-ss", formatTime(clip.start + clip.duration / 2), "-i", videoPath,
            "-vframes", "1", "-vf", scaleFilter + ",scale=320:-1",
            "-q:v", "5", thumbPath
          ]);

          generatedClips.push({
            id: clip.id,
            filename,
            downloadUrl: `/api/opus/job-file?jobId=${jobId}&file=${encodeURIComponent(filename)}`,
            thumbnailUrl: `/api/opus/job-file?jobId=${jobId}&file=${encodeURIComponent(thumbFilename)}`,
            start: clip.start,
            end: clip.end,
            duration: clip.duration,
            text: clip.text,
            score: clip.score,
          });

        const clipProgress = 70 + Math.floor((i + 1) / engagingClips.length * 25);
        await updateJob(jobId, { progress: clipProgress });
      }

      const clipFiles = generatedClips.map((c) => path.join(sessionDir, c.filename));
      const zipFilename = `clips_${jobId.slice(0, 8)}.zip`;
      const zipPath = path.join(sessionDir, zipFilename);
      await createZip(clipFiles, zipPath);

      await updateJob(jobId, {
        status: "completed",
        current_step: "done",
        progress: 100,
        clips: {
          items: generatedClips,
          zipUrl: `/api/opus/job-file?jobId=${jobId}&file=${encodeURIComponent(zipFilename)}`,
        },
      });

      try {
          await unlink(audioPath);
          await unlink(videoPath);
        } catch {}

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
