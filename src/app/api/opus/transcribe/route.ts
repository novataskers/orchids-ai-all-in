import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

const isProduction = process.env.NODE_ENV === "production";
const TMP_BASE = isProduction ? "/tmp" : path.join(process.cwd(), "tmp");
const AUDIO_DIR = path.join(TMP_BASE, "audio");

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
};

export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
};

async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  await execAsync(
    `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`
  );
}

export async function POST(request: NextRequest) {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  try {
    const formData = await request.formData();
    const videoPath = formData.get("videoPath") as string | null;
    const audioUrl = formData.get("audioUrl") as string | null;
    const audioFile = formData.get("audio") as File | null;

    const sessionId = uuidv4();
    const sessionDir = path.join(AUDIO_DIR, sessionId);
    await ensureDir(sessionDir);

    let audioFilePath: string;

    if (videoPath && existsSync(videoPath)) {
      audioFilePath = path.join(sessionDir, "audio.wav");
      await extractAudio(videoPath, audioFilePath);
    } else if (audioFile) {
      const bytes = await audioFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = path.extname(audioFile.name) || ".wav";
      audioFilePath = path.join(sessionDir, `audio${ext}`);
      await writeFile(audioFilePath, buffer);

      if (ext !== ".wav") {
        const wavPath = path.join(sessionDir, "audio.wav");
        await execAsync(
          `ffmpeg -y -i "${audioFilePath}" -acodec pcm_s16le -ar 16000 -ac 1 "${wavPath}"`
        );
        audioFilePath = wavPath;
      }
    } else if (audioUrl) {
      audioFilePath = audioUrl;
    } else {
      return NextResponse.json(
        { error: "No audio source provided" },
        { status: 400 }
      );
    }

    let inputSource: string;
    if (audioFilePath.startsWith("http")) {
      inputSource = audioFilePath;
    } else {
      const audioBuffer = await readFile(audioFilePath);
      const base64Audio = audioBuffer.toString("base64");
      inputSource = `data:audio/wav;base64,${base64Audio}`;
    }

    const output = await replicate.run(
      "openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2",
      {
        input: {
          audio: inputSource,
          model: "large-v3",
          language: "auto",
          translate: false,
          temperature: 0,
          transcription: "plain text",
          suppress_tokens: "-1",
          logprob_threshold: -1,
          no_speech_threshold: 0.6,
          condition_on_previous_text: true,
          compression_ratio_threshold: 2.4,
          temperature_increment_on_fallback: 0.2,
        },
      }
    ) as { transcription: string; segments: Array<{ start: number; end: number; text: string }> };

    const segments: TranscriptSegment[] = (output.segments || []).map((seg, idx) => ({
      id: idx,
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
      words: [],
    }));

    const result: TranscriptionResult = {
      text: output.transcription || "",
      segments,
      language: "auto",
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    };

    if (!audioFilePath.startsWith("http")) {
      setTimeout(async () => {
        try {
          const files = await import("fs/promises").then((m) => m.readdir(sessionDir));
          for (const file of files) {
            await unlink(path.join(sessionDir, file));
          }
          await import("fs/promises").then((m) => m.rmdir(sessionDir));
        } catch {}
      }, 60000);
    }

    return NextResponse.json({
      success: true,
      transcription: result,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
