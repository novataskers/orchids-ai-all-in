"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Download,
  FileVideo,
  Loader2,
  ArrowLeft,
  Youtube,
  Sparkles,
  Captions,
  Clock,
  Zap,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

type VideoInfo = {
  title: string;
  duration: number;
  thumbnail: string;
  videoId?: string;
};

type GeneratedClip = {
  id: number;
  filename: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  start: number;
  end: number;
  duration: number;
  text: string;
  score: number;
};

type JobStatus = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  currentStep: string;
  progress: number;
  videoInfo: VideoInfo;
  transcription?: { text: string; segments: unknown[] };
  clips?: { items: GeneratedClip[]; zipUrl: string };
  errorMessage?: string;
};

const STEP_CONFIG: Record<string, { label: string }> = {
  queued: { label: "Queued" },
  downloading_audio: { label: "Downloading Audio" },
  transcribing: { label: "AI Transcription" },
  finding_clips: { label: "Finding Best Parts" },
  downloading_video: { label: "Downloading Video" },
  cutting_clips: { label: "Cutting Clips" },
  done: { label: "Complete" },
  error: { label: "Error" },
};

const PROCESSING_STEPS = [
  "downloading_audio",
  "transcribing", 
  "finding_clips",
  "downloading_video",
  "cutting_clips",
  "done"
];

export default function OpusPage() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [clipDuration, setClipDuration] = useState(30);
  const [maxClips, setMaxClips] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [addCaptions, setAddCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<"classic" | "bold" | "outline" | "glow">("bold");

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const pollJobStatus = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/opus/job-status?jobId=${id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch job status");
      }
      const data: JobStatus = await response.json();
      setJobStatus(data);

      if (data.status === "completed" || data.status === "failed") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (data.status === "failed") {
          setErrorMessage(data.errorMessage || "Processing failed");
        }
      }
    } catch (error) {
      console.error("Poll error:", error);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const startPolling = (id: string) => {
    pollJobStatus(id);
    pollIntervalRef.current = setInterval(() => {
      pollJobStatus(id);
    }, 2000);
  };

  const resetState = () => {
    setYoutubeUrl("");
    setJobId(null);
    setJobStatus(null);
    setErrorMessage("");
    setIsSubmitting(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleSubmit = async () => {
    if (!youtubeUrl.trim()) {
      setErrorMessage("Please enter a YouTube URL");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/opus/create-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          clipDuration,
          maxClips,
          aspectRatio,
          addCaptions,
          captionStyle,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create job");
      }

      const data = await response.json();
      setJobId(data.jobId);
      setIsSubmitting(false);
      startPolling(data.jobId);
    } catch (error) {
      setIsSubmitting(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to create job");
    }
  };

  const isProcessing = jobId !== null && jobStatus?.status === "processing";
  const isCompleted = jobStatus?.status === "completed";
  const isFailed = jobStatus?.status === "failed";
  const clips = jobStatus?.clips?.items || [];

  const getCurrentStepIndex = () => {
    if (!jobStatus) return -1;
    return PROCESSING_STEPS.indexOf(jobStatus.currentStep);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-purple-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-mono text-sm">Back to Dashboard</span>
        </Link>

        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-purple-500/10 p-4 border border-purple-500/20">
            <Sparkles className="h-10 w-10 text-purple-400" />
          </div>
          <h1 className="mb-2 font-mono text-4xl font-bold tracking-tight">
            AI Clip Generator
          </h1>
          <p className="font-mono text-sm text-zinc-500">
            Turn long YouTube videos into viral short clips with AI
          </p>
        </div>

        {!jobId && (
          <>
            {process.env.NEXT_PUBLIC_VERCEL_URL && (
              <div className="mb-6 rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
                <p className="font-mono text-sm text-amber-400">
                  <AlertCircle className="inline w-4 h-4 mr-2" />
                  Video processing requires ffmpeg and is only available when running locally. 
                  Deployed versions cannot process videos.
                </p>
              </div>
            )}
            <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm mb-6">
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="youtube-url" className="font-mono text-sm text-zinc-400 flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    YouTube Video URL
                  </Label>
                  <Input
                    id="youtube-url"
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                    className="border-zinc-800 bg-zinc-950 font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500 focus:ring-purple-500 h-12"
                    disabled={isSubmitting}
                  />
                  <p className="font-mono text-xs text-zinc-600">
                    Paste any YouTube video link to generate viral clips
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 font-mono text-lg text-zinc-200">
                  <Zap className="h-5 w-5 text-purple-400" />
                  Clip Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-mono text-sm text-zinc-400">Clip Duration</Label>
                      <span className="font-mono text-sm text-purple-400">&lt;{clipDuration}s</span>
                    </div>
                    <RadioGroup
                      value={String(clipDuration)}
                      onValueChange={(v) => setClipDuration(Number(v))}
                      className="flex gap-4"
                      disabled={isSubmitting}
                    >
                      {[
                        { value: "30", label: "<30s" },
                        { value: "60", label: "<60s" },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-2 transition-all ${
                            clipDuration === Number(opt.value)
                              ? "border-purple-500 bg-purple-500/10"
                              : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                          }`}
                        >
                          <RadioGroupItem value={opt.value} className="sr-only" />
                          <span className="font-mono text-sm text-zinc-200">{opt.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                    <p className="font-mono text-xs text-zinc-600">TikTok/Reels max: 60s</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-mono text-sm text-zinc-400">Max Clips</Label>
                      <span className="font-mono text-sm text-purple-400">{maxClips}</span>
                    </div>
                    <Slider
                      value={[maxClips]}
                      onValueChange={(v) => setMaxClips(v[0])}
                      min={1}
                      max={10}
                      step={1}
                      disabled={isSubmitting}
                      className="w-full"
                    />
                    <p className="font-mono text-xs text-zinc-600">1 - 10 clips</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="font-mono text-sm text-zinc-400">Aspect Ratio</Label>
                  <RadioGroup
                    value={aspectRatio}
                    onValueChange={(v) => setAspectRatio(v as "9:16" | "16:9")}
                    className="grid grid-cols-2 gap-3"
                    disabled={isSubmitting}
                  >
                    {[
                      { value: "9:16", label: "9:16", desc: "TikTok/Reels" },
                      { value: "16:9", label: "16:9", desc: "YouTube" },
                    ].map((ratio) => (
                      <label
                        key={ratio.value}
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-3 transition-all ${
                          aspectRatio === ratio.value
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                        }`}
                      >
                        <RadioGroupItem value={ratio.value} className="sr-only" />
                        <span className="font-mono text-sm text-zinc-200">{ratio.label}</span>
                        <span className="font-mono text-xs text-zinc-500">{ratio.desc}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="add-captions"
                      checked={addCaptions}
                      onChange={(e) => setAddCaptions(e.target.checked)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-purple-600 focus:ring-purple-500"
                    />
                    <Label htmlFor="add-captions" className="font-mono text-sm text-zinc-300 cursor-pointer">
                      <Captions className="inline w-4 h-4 mr-2" />
                      Add AI-generated captions
                    </Label>
                  </div>

                  {addCaptions && (
                    <div className="mt-4 space-y-3 pl-7">
                      <Label className="font-mono text-xs text-zinc-500">Caption Style</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: "classic", label: "Classic", preview: "Aa", bg: "bg-black/80", text: "text-white", border: "" },
                          { value: "bold", label: "Bold Box", preview: "Aa", bg: "bg-yellow-400", text: "text-black font-black", border: "" },
                          { value: "outline", label: "Outline", preview: "Aa", bg: "bg-transparent", text: "text-white font-bold", border: "border-2 border-white" },
                          { value: "glow", label: "Neon Glow", preview: "Aa", bg: "bg-purple-600", text: "text-white font-bold", border: "shadow-[0_0_20px_rgba(168,85,247,0.8)]" },
                        ].map((style) => (
                          <button
                            key={style.value}
                            type="button"
                            onClick={() => setCaptionStyle(style.value as "classic" | "bold" | "outline" | "glow")}
                            disabled={isSubmitting}
                            className={`flex flex-col items-center justify-center rounded-lg border-2 p-3 transition-all ${
                              captionStyle === style.value
                                ? "border-purple-500 bg-purple-500/10"
                                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                            }`}
                          >
                            <div className={`px-3 py-1 rounded ${style.bg} ${style.text} ${style.border} text-sm mb-2`}>
                              {style.preview}
                            </div>
                            <span className="font-mono text-xs text-zinc-400">{style.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !youtubeUrl.trim()}
              className="w-full bg-purple-600 font-mono text-white hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 h-14 text-lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating job...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Viral Clips
                </>
              )}
            </Button>
          </>
        )}

        {jobId && (
          <div className="space-y-6">
            {jobStatus?.videoInfo && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {jobStatus.videoInfo.thumbnail && (
                      <img
                        src={jobStatus.videoInfo.thumbnail}
                        alt={jobStatus.videoInfo.title}
                        className="w-40 h-24 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-mono text-sm font-medium text-zinc-200 line-clamp-2">
                        {jobStatus.videoInfo.title}
                      </h3>
                      {jobStatus.videoInfo.duration > 0 && (
                        <p className="mt-1 font-mono text-xs text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(jobStatus.videoInfo.duration)}
                        </p>
                      )}
                      {isProcessing && (
                        <p className="mt-2 font-mono text-xs text-purple-400">
                          Processing your video... This may take a few minutes.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 font-mono text-lg text-zinc-200">
                  {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-purple-400" />}
                  {isCompleted && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                  {isFailed && <AlertCircle className="h-5 w-5 text-red-400" />}
                  Processing Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between font-mono text-sm">
                    <span className="text-zinc-400">Progress</span>
                    <span className="text-purple-400">{jobStatus?.progress || 0}%</span>
                  </div>
                  <Progress value={jobStatus?.progress || 0} className="h-2" />
                </div>

                <div className="space-y-2 pt-2">
                  {PROCESSING_STEPS.map((step, idx) => {
                    const currentIdx = getCurrentStepIndex();
                    const isActive = step === jobStatus?.currentStep && jobStatus?.status !== "completed";
                    const isComplete = idx < currentIdx || jobStatus?.status === "completed";

                    return (
                      <div
                        key={step}
                        className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
                          isActive
                            ? "bg-purple-500/10 border border-purple-500/30"
                            : isComplete
                            ? "bg-emerald-500/5 border border-emerald-500/20"
                            : "bg-zinc-900/30 border border-zinc-800/50"
                        }`}
                      >
                        <div className="w-6 h-6 flex items-center justify-center">
                          {isActive ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          ) : isComplete ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-zinc-600" />
                          )}
                        </div>
                        <span
                          className={`font-mono text-sm ${
                            isActive
                              ? "text-purple-400"
                              : isComplete
                              ? "text-emerald-400"
                              : "text-zinc-600"
                          }`}
                        >
                          {STEP_CONFIG[step]?.label || step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {clips.length > 0 && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 font-mono text-lg text-zinc-200">
                      <FileVideo className="h-5 w-5 text-purple-400" />
                      Generated Clips ({clips.length})
                    </CardTitle>
                    {jobStatus?.clips?.zipUrl && (
                      <a
                        href={jobStatus.clips.zipUrl}
                        download
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-mono text-sm text-white transition-colors hover:bg-purple-500"
                      >
                        <Download className="h-4 w-4" />
                        Download All
                      </a>
                    )}
                  </div>
                </CardHeader>
<CardContent className="space-y-4">
                    {clips.map((clip) => (
                      <div
                        key={clip.id}
                        className="flex items-start gap-4 rounded-lg bg-zinc-950 p-4 border border-zinc-800 hover:border-zinc-700 transition-colors"
                      >
                        {clip.thumbnailUrl && (
                          <img
                            src={clip.thumbnailUrl}
                            alt={`Clip ${clip.id} preview`}
                            className="w-24 h-auto rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-medium text-purple-400">
                              Clip {clip.id}
                            </span>
                            <span className="font-mono text-xs text-zinc-600">
                              {formatDuration(clip.start)} - {formatDuration(clip.end)}
                            </span>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              Score: {clip.score.toFixed(1)}
                            </span>
                          </div>
                          {clip.text && (
                            <p className="font-mono text-xs text-zinc-500 line-clamp-2">{clip.text}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <a
                            href={clip.downloadUrl}
                            download={clip.filename}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </CardContent>
              </Card>
            )}

            {(isCompleted || isFailed) && (
              <Button
                onClick={resetState}
                variant="outline"
                className="w-full border-zinc-700 font-mono hover:bg-zinc-800"
              >
                Process Another Video
              </Button>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-center">
            <p className="font-mono text-sm text-red-400">{errorMessage}</p>
            <Button
              onClick={resetState}
              variant="outline"
              size="sm"
              className="mt-3 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              Try Again
            </Button>
          </div>
        )}

        <p className="mt-8 text-center font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
          Powered by AI • Like Vizard.ai
        </p>
      </div>
    </div>
  );
}
