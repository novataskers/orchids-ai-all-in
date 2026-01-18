"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Video,
  Scissors, 
  Music, 
  Mic2, 
  FileText, 
  Wand2, 
  Download,
  Play,
  Pause,
  Radio,
  Disc,
  Loader2,
  Zap,
  Volume2,
  Image as ImageIcon,
  Upload
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateLyricVideo } from "@/lib/video-generator";

const genres = ["Lo-fi", "Synthwave", "Cyberpunk", "Classical", "Hip Hop", "Rock", "Acoustic"];
const voices = [
  { name: "Serena", type: "Vocalist", icon: Mic2 },
  { name: "Marcus", type: "Rapper", icon: Mic2 },
  { name: "Luna", type: "Pop Star", icon: Mic2 },
];

export default function SunoPage() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeVoice, setActiveVoice] = useState("Serena");
  const [prompt, setPrompt] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("Lo-fi");
  const [energy, setEnergy] = useState(75);
  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentSong, setCurrentSong] = useState<any>({
    title: "No Song Selected",
    audioUrl: "",
    imageUrl: "",
    lyrics: "Select a song from your library or generate a new one to get started.",
    duration: 0,
    currentTime: 0,
    status: 'empty'
  });
  const [activeVersion, setActiveVersion] = useState<'v4' | 'v35'>('v4');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPollingId = useRef<string | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem("suno_history");
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
        parsed.forEach((item: any) => {
          if (item.v4Status === 'generating' && item.v4Id) {
            startPolling(item.v4Id, 'v4', item.id);
          }
          if (item.v35Status === 'generating' && item.v35Id) {
            startPolling(item.v35Id, 'v35', item.id);
          }
        });
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("suno_history", JSON.stringify(history));
  }, [history]);

  const startPolling = async (taskId: string, version: 'v4' | 'v35', historyItemId: string) => {
    let pollCount = 0;
    const maxPolls = 60;
    
    const pollStatus = async () => {
      try {
        const statusRes = await fetch(`/api/suno/status?ids=${taskId}`);
        
        if (!statusRes.ok) {
          if (pollCount < maxPolls) {
            pollCount++;
            setGenerationProgress(Math.min(95, Math.floor((pollCount / maxPolls) * 100)));
            setTimeout(pollStatus, 5000);
            return;
          }
        }

        const statusData = await statusRes.json();
        const song = Array.isArray(statusData) ? statusData[0] : statusData;
        
        if (song && (song.status === 'complete' || song.audio_url)) {
const versionData = {
              audioUrl: song.audio_url,
              imageUrl: song.image_url || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&q=80",
              title: song.title || "Generated Song",
              timestampedLyrics: song.timestampedLyrics,
              lyrics: song.lyrics,
              status: 'complete'
            };
          
          setHistory(prev => {
            const updated = prev.map(item => {
              if (item.id === historyItemId) {
                const newItem = { ...item };
                if (version === 'v4') {
                  newItem.v4 = versionData;
                  newItem.v4Status = 'complete';
                } else {
                  newItem.v35 = versionData;
                  newItem.v35Status = 'complete';
                }
                if (newItem.v4Status === 'complete' || newItem.v35Status === 'complete') {
                  newItem.status = 'complete';
                }
                return newItem;
              }
              return item;
            });
            
const item = updated.find(i => i.id === historyItemId);
              if (item && currentPollingId.current === historyItemId) {
                const activeVer = activeVersion === 'v4' ? item.v4 : item.v35;
                if (activeVer?.status === 'complete') {
                  const displayLyrics = activeVer.lyrics || item.lyrics;
                  setCurrentSong({
                      ...item,
                      audioUrl: activeVer.audioUrl,
                      imageUrl: activeVer.imageUrl,
                      title: activeVer.title || item.title,
                      lyrics: displayLyrics,
                      timestampedLyrics: activeVer.timestampedLyrics,
                    });
                  toast.success(`${version.toUpperCase()} version ready!`);
                }
                
                const bothDone = (item.v4Status === 'complete' || item.v4Status === 'error' || item.v4Status === 'timeout' || !item.v4Id) &&
                                 (item.v35Status === 'complete' || item.v35Status === 'error' || item.v35Status === 'timeout' || !item.v35Id);
                if (bothDone) {
                  setIsLoading(false);
                  setGenerationProgress(0);
                }
              }
            return updated;
          });
          return;
        }

        if (song && song.status === 'error') {
          setHistory(prev => {
            const updated = prev.map(item => {
              if (item.id === historyItemId) {
                const newItem = { ...item };
                if (version === 'v4') {
                  newItem.v4Status = 'error';
                } else {
                  newItem.v35Status = 'error';
                }
                return newItem;
              }
              return item;
            });
            
            const item = updated.find(i => i.id === historyItemId);
            if (item && currentPollingId.current === historyItemId) {
              const bothDone = (item.v4Status === 'complete' || item.v4Status === 'error' || item.v4Status === 'timeout' || !item.v4Id) &&
                               (item.v35Status === 'complete' || item.v35Status === 'error' || item.v35Status === 'timeout' || !item.v35Id);
              if (bothDone) {
                setIsLoading(false);
                setGenerationProgress(0);
              }
            }
            return updated;
          });
          return;
        }
        
        if (pollCount < maxPolls) {
          pollCount++;
          setGenerationProgress(Math.min(95, Math.floor((pollCount / maxPolls) * 100)));
          setTimeout(pollStatus, 4000);
        } else {
          setHistory(prev => {
            const updated = prev.map(item => {
              if (item.id === historyItemId) {
                const newItem = { ...item };
                if (version === 'v4') {
                  newItem.v4Status = 'timeout';
                } else {
                  newItem.v35Status = 'timeout';
                }
                return newItem;
              }
              return item;
            });
            
            const item = updated.find(i => i.id === historyItemId);
            if (item && currentPollingId.current === historyItemId) {
              const bothDone = (item.v4Status === 'complete' || item.v4Status === 'error' || item.v4Status === 'timeout' || !item.v4Id) &&
                               (item.v35Status === 'complete' || item.v35Status === 'error' || item.v35Status === 'timeout' || !item.v35Id);
              if (bothDone) {
                setIsLoading(false);
                setGenerationProgress(0);
              }
            }
            return updated;
          });
        }
      } catch (error) {
        console.error("Polling error:", error);
        setHistory(prev => {
          const updated = prev.map(item => {
            if (item.id === historyItemId) {
              const newItem = { ...item };
              if (version === 'v4') {
                newItem.v4Status = 'error';
              } else {
                newItem.v35Status = 'error';
              }
              return newItem;
            }
            return item;
          });
          
          const item = updated.find(i => i.id === historyItemId);
          if (item && currentPollingId.current === historyItemId) {
            const bothDone = (item.v4Status === 'complete' || item.v4Status === 'error' || item.v4Status === 'timeout' || !item.v4Id) &&
                             (item.v35Status === 'complete' || item.v35Status === 'error' || item.v35Status === 'timeout' || !item.v35Id);
            if (bothDone) {
              setIsLoading(false);
              setGenerationProgress(0);
              toast.error("Error checking status");
            }
          }
          return updated;
        });
      }
    };
    
    pollStatus();
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.error("Playback failed", e);
            setIsPlaying(false);
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong.audioUrl, retryCount]);

  const handleAudioError = (e: any) => {
    if (currentSong.audioUrl && isPlaying) {
      if (retryCount < 3) {
        const nextRetry = retryCount + 1;
        setTimeout(() => {
          setRetryCount(nextRetry);
          if (audioRef.current) {
            audioRef.current.load();
            setIsPlaying(true);
          }
        }, 2000);
      } else {
        toast.error("Audio failed to load.");
        setIsPlaying(false);
        setRetryCount(0);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentSong(prev => ({
        ...prev,
        currentTime: audioRef.current?.currentTime || 0,
        duration: audioRef.current?.duration || 0
      }));
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentSong(prev => ({ ...prev, currentTime: value[0] }));
    }
  };

  const handleGenerateLyrics = async () => {
    if (!prompt) {
      toast.error("Please enter a prompt first");
      return;
    }
    
    setIsGeneratingLyrics(true);
    try {
      const res = await fetch("/api/suno/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.lyrics) {
        setPrompt(data.lyrics);
        toast.success("Lyrics generated!");
      }
    } catch (error) {
      toast.error("Failed to generate lyrics");
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!prompt) {
      toast.error("Please enter a prompt or lyrics");
      return;
    }

    setIsLoading(true);
    setIsPlaying(false);
    setGeneratedVideoUrl(null);
    
    const historyId = `song-${Date.now()}`;
    const newHistoryItem = {
      id: historyId,
      title: prompt.split('\n')[0].slice(0, 30) || "Untitled Song",
      status: 'generating',
      genre: selectedGenre,
      timestamp: new Date().toISOString(),
      lyrics: prompt,
      audioUrl: "",
      imageUrl: "",
      v4: null,
      v35: null,
      v4Status: 'generating',
      v35Status: 'generating',
      v4Id: null,
      v35Id: null,
    };
    setHistory(prev => [newHistoryItem, ...prev]);
    setCurrentSong({
      ...newHistoryItem,
      duration: 0,
      currentTime: 0
    });
    currentPollingId.current = historyId;

    try {
      const res = await fetch("/api/suno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt, 
          genre: selectedGenre, 
          energy 
        })
      });
      
      const data = await res.json();
      
      if (data.v4Id || data.v35Id) {
        setHistory(prev => prev.map(item => 
          item.id === historyId ? { 
            ...item, 
            v4Id: data.v4Id,
            v35Id: data.v35Id,
          } : item
        ));
        
        if (data.v4Id) {
          startPolling(data.v4Id, 'v4', historyId);
        }
        if (data.v35Id) {
          startPolling(data.v35Id, 'v35', historyId);
        }
      } else {
        setIsLoading(false);
        setHistory(prev => prev.map(item => 
          item.id === historyId ? { ...item, status: 'error' } : item
        ));
        toast.error(data.message || data.error || "Failed to start generation");
      }
    } catch (error) {
      console.error("Generation error:", error);
      setIsLoading(false);
      setHistory(prev => prev.map(item => 
        item.id === historyId ? { ...item, status: 'error' } : item
      ));
      toast.error("An error occurred");
    }
  };

  const handleGenerateVoice = async () => {
    if (!voiceText) {
      toast.error("Please enter some text for the voice");
      return;
    }

    setIsLoading(true);
    const tempId = `voice-temp-${Date.now()}`;
    const generatingVoice = {
      id: tempId,
      title: `Voice: ${voiceText.slice(0, 20)}...`,
      status: 'generating',
      genre: 'Voice Clone',
      timestamp: new Date().toISOString(),
      lyrics: voiceText,
      audioUrl: "",
      imageUrl: ""
    };
    setCurrentSong(generatingVoice);

    try {
      const res = await fetch("/api/suno/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: voiceText, 
          voiceName: activeVoice 
        })
      });
      
      const data = await res.json();
      if (data.audio_url) {
        const newVoice = {
          id: `voice-${Date.now()}`,
          title: `Voice: ${voiceText.slice(0, 20)}...`,
          audioUrl: data.audio_url,
          imageUrl: "",
          lyrics: voiceText,
          duration: 0,
          currentTime: 0,
          status: 'complete',
          genre: 'Voice Clone',
          timestamp: new Date().toISOString()
        };
        setCurrentSong(newVoice);
        setHistory(prev => [newVoice, ...prev]);
        toast.success("Voice generated successfully!");
      } else {
        console.error("Voice Generation Failed:", data);
        toast.error(data.message || data.error || "Failed to generate voice");
      }
    } catch (error: any) {
      console.error("Voice Generation Error:", error);
      toast.error(`An error occurred: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error("Please upload an image file");
        return;
      }
      const url = URL.createObjectURL(file);
      setCustomImage(url);
      handleGenerateVideo(url);
    }
  };

  const handleGenerateVideo = async (overrideImage?: string) => {
    console.log("Generating video for audio URL:", currentSong.audioUrl);
    
    if (!currentSong.audioUrl) {
      toast.error("No audio URL found for this song. Please wait for generation to complete.");
      return;
    }

    setIsVideoLoading(true);
    setVideoProgress(0);
    setGeneratedVideoUrl(null);
    setShowVideoDialog(false);
    
    try {
      const videoUrl = await generateLyricVideo(
        currentSong.audioUrl, 
        currentSong.lyrics, 
        overrideImage || currentSong.imageUrl,
        (progress) => {
          setVideoProgress(progress);
        },
        currentSong.timestampedLyrics
      );
      setGeneratedVideoUrl(videoUrl);
      toast.success("Lyric video created!");
    } catch (error: any) {
      console.error("Video Generation Error:", error);
      toast.error(`Video Error: ${error.message || "Failed to create lyric video"}`);
    } finally {
      setIsVideoLoading(false);
      setVideoProgress(0);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-8 lg:p-12">
      {currentSong.audioUrl && (
        <audio 
          key={currentSong.audioUrl}
          ref={audioRef} 
          src={currentSong.audioUrl} 
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onError={handleAudioError}
        />
      )}
      
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-white mb-4">Suno Studio</h1>
          <p className="text-zinc-400 max-w-xl">
            Compose high-fidelity music and voices with professional AI models.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7">
          <Card className="bg-zinc-900/50 border-zinc-800 p-8 h-full">
            <Tabs defaultValue="text-music" className="space-y-8">
              <TabsList className="bg-zinc-950 border border-zinc-800 w-full justify-start overflow-x-auto">
                <TabsTrigger value="text-music" className="gap-2 data-[state=active]:bg-pink-600">
                  <FileText className="w-4 h-4" /> Text to Music
                </TabsTrigger>
                <TabsTrigger value="voice-clone" className="gap-2 data-[state=active]:bg-pink-600">
                  <Mic2 className="w-4 h-4" /> Voice Cloning
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text-music" className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-zinc-400 uppercase text-[10px] tracking-widest font-bold">Song Prompt / Lyrics</Label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full h-48 bg-zinc-950/50 border border-zinc-800 rounded-2xl p-6 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
                    placeholder="[Verse 1]&#10;Midnight rain on a neon street...&#10;&#10;[Chorus]&#10;Lost in the rhythm of the city heart..."
                  />
                  <div className="flex justify-between">
                    <Button 
                      variant="ghost" 
                      onClick={handleGenerateLyrics}
                      disabled={isGeneratingLyrics}
                      className="text-pink-400 text-xs gap-1 h-auto p-0 hover:bg-transparent disabled:opacity-50"
                    >
                      {isGeneratingLyrics ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      Generate AI Lyrics
                    </Button>
                    <span className="text-xs text-zinc-500">{prompt.length} / 2000</span>
                  </div>
                </div>

                {/* Genre and Energy sections removed */}

                <div className="space-y-4">
                  <Button 
                    onClick={handleGenerateMusic}
                    disabled={isLoading}
                    className="w-full h-16 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-bold text-lg gap-3 disabled:opacity-50 relative overflow-hidden"
                  >
                    {isLoading ? (
                      <>
                        <div 
                          className="absolute inset-0 bg-white/20 transition-all duration-500 ease-out"
                          style={{ width: `${generationProgress}%` }}
                        />
                        <Loader2 className="w-6 h-6 animate-spin relative z-10" />
                        <span className="relative z-10">Generating... {generationProgress}%</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-6 h-6 animate-pulse" />
                        <span>Generate Music</span>
                      </>
                    )}
                  </Button>
                  
                  {isLoading && (
                    <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${generationProgress}%` }}
                        className="bg-gradient-to-r from-pink-500 to-purple-500 h-full"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="voice-clone" className="space-y-8">
                <div className="space-y-4">
                  <textarea 
                    value={voiceText}
                    onChange={(e) => setVoiceText(e.target.value)}
                    className="w-full h-48 bg-zinc-950/50 border border-zinc-800 rounded-2xl p-6 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
                    placeholder="Type the text you want the AI to speak or sing..."
                  />
                </div>

                <div className="space-y-4">
                  <Label className="text-zinc-400 uppercase text-[10px] tracking-widest font-bold">Select AI Voice</Label>
                  <div className="grid grid-cols-3 gap-4">
                    {voices.map(voice => (
                      <button
                        key={voice.name}
                        onClick={() => setActiveVoice(voice.name)}
                        className={cn(
                          "flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all",
                          activeVoice === voice.name 
                            ? "bg-pink-600 border-pink-500 text-white" 
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        <voice.icon className="w-6 h-6" />
                        <div className="text-center">
                          <div className="text-xs font-bold">{voice.name}</div>
                          <div className="text-[10px] opacity-70">{voice.type}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleGenerateVoice}
                  disabled={isLoading}
                  className="w-full h-16 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg gap-3 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mic2 className="w-6 h-6" />}
                  {isLoading ? "Generating Voice..." : "Generate AI Voice"}
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-8">
          <Card className="bg-zinc-950 border-zinc-800 p-8 flex flex-col items-center text-center overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 animate-gradient-x" />
            
            <motion.div 
              animate={{ rotate: isPlaying ? 360 : 0 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="w-48 h-48 rounded-full border-8 border-zinc-900 shadow-[0_0_50px_-10px_rgba(236,72,153,0.3)] bg-zinc-900 flex items-center justify-center mb-8 relative overflow-hidden"
            >
              {currentSong.imageUrl ? (
                <img 
                  src={currentSong.imageUrl} 
                  alt={currentSong.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                />
              ) : currentSong.genre === 'Voice Clone' ? (
                <Mic2 className="w-32 h-32 text-pink-500 opacity-40" />
              ) : (
                <Disc className="w-32 h-32 text-zinc-800 opacity-20" />
              )}
              <div className="absolute inset-4 rounded-full border border-zinc-700/50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Music className="w-12 h-12 text-pink-500" />
              </div>
            </motion.div>

            <h3 className="text-2xl font-bold text-white mb-1 truncate w-full px-4">
              {currentSong.status === 'generating' ? `Generating... ${currentSong.title}` : currentSong.title}
            </h3>
<p className="text-zinc-500 mb-6 uppercase tracking-widest text-[10px] font-bold">
                {currentSong.genre || (currentSong.status === 'generating' ? 'AI Mix' : '')} {currentSong.duration > 0 ? `• ${formatTime(currentSong.duration)}` : ''}
              </p>

              {currentSong.v4 || currentSong.v35 || currentSong.v4Status || currentSong.v35Status ? (
                <div className="flex gap-2 mb-4">
<button
                      onClick={() => {
setActiveVersion('v4');
                          if (currentSong.v4?.audioUrl) {
                            setIsPlaying(false);
                            setCurrentSong(prev => ({
                              ...prev,
                              audioUrl: currentSong.v4.audioUrl,
                              imageUrl: currentSong.v4.imageUrl || prev.imageUrl,
                              lyrics: currentSong.v4.lyrics || prev.lyrics,
                              timestampedLyrics: currentSong.v4.timestampedLyrics,
                            }));
                          }
                        }}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold transition-all",
                      activeVersion === 'v4'
                        ? "bg-pink-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    {currentSong.v4Status === 'generating' ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> V4
                      </span>
                    ) : currentSong.v4Status === 'complete' ? (
                      'V4'
                    ) : currentSong.v4Status === 'error' ? (
                      'V4 (Error)'
                    ) : (
                      'V4'
                    )}
                  </button>
<button
                      onClick={() => {
setActiveVersion('v35');
                          if (currentSong.v35?.audioUrl) {
                            setIsPlaying(false);
                            setCurrentSong(prev => ({
                              ...prev,
                              audioUrl: currentSong.v35.audioUrl,
                              imageUrl: currentSong.v35.imageUrl || prev.imageUrl,
                              lyrics: currentSong.v35.lyrics || prev.lyrics,
                              timestampedLyrics: currentSong.v35.timestampedLyrics,
                            }));
                          }
                        }}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold transition-all",
                      activeVersion === 'v35'
                        ? "bg-purple-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    {currentSong.v35Status === 'generating' ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> V3.5
                      </span>
                    ) : currentSong.v35Status === 'complete' ? (
                      'V3.5'
                    ) : currentSong.v35Status === 'error' ? (
                      'V3.5 (Error)'
                    ) : (
                      'V3.5'
                    )}
                  </button>
                </div>
              ) : null}

              <div className="w-full space-y-4 mb-8">
              <Slider 
                value={[currentSong.currentTime]} 
                max={currentSong.duration || 100} 
                onValueChange={handleSeek}
                className="w-full h-1.5" 
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>{formatTime(currentSong.currentTime)}</span>
                <span>{formatTime(currentSong.duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <Button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-16 h-16 rounded-full bg-white text-black hover:scale-105 transition-transform"
                disabled={!currentSong.audioUrl}
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-black" /> : <Play className="w-8 h-8 fill-black ml-1" />}
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-zinc-400 hover:text-white" 
                  onClick={() => setShowVideoDialog(true)}
                  disabled={!currentSong.audioUrl || isVideoLoading}
                >
                  {isVideoLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                </Button>
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white" asChild disabled={!currentSong.audioUrl}>
                  <a href={currentSong.audioUrl} download={`${currentSong.title}.mp3`}>
                    <Download className="w-5 h-5" />
                  </a>
                </Button>
              </div>
            </div>

            {isVideoLoading && (
              <div className="mt-6 flex flex-col items-center gap-3 w-full">
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-400">Creating lyric video... {videoProgress}%</p>
              </div>
            )}

            {generatedVideoUrl && (
              <div className="mt-8 w-full space-y-4">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-800">
                  <video 
                    src={generatedVideoUrl} 
                    controls 
                    className="w-full h-full"
                  />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full gap-2 border-zinc-800 hover:bg-zinc-900" 
                  asChild
                >
                <a href={generatedVideoUrl} download={`${currentSong.title || 'lyric-video'}.mp4`}>
                      <Download className="w-4 h-4" /> Download MP4 Video
                  </a>
                </Button>
              </div>
            )}
          </Card>

          <Card className="bg-zinc-900/30 border-zinc-800 p-6 h-[250px] flex flex-col overflow-hidden">
            <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-widest shrink-0">Lyrics / Transcript</h4>
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full text-left">
                <div className="pr-4">
                  <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                    {currentSong.lyrics && currentSong.lyrics !== "Select a song from your library or generate a new one to get started." 
                      ? currentSong.lyrics 
                      : prompt 
                        ? prompt 
                        : "No lyrics available. Enter lyrics above and generate a song."}
                  </pre>
                </div>
              </ScrollArea>
            </div>
          </Card>

          <Card className="bg-zinc-900/30 border-zinc-800 p-6">
            <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex justify-between items-center">
              Your Library
              <Badge variant="outline" className="text-[10px] h-5">{history.length}</Badge>
            </h4>
            <ScrollArea className="h-[250px]">
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-xs italic">
                    Your library is empty.
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "p-3 rounded-xl border flex items-center gap-3 transition-all cursor-pointer",
                        currentSong.id === item.id
                          ? "bg-pink-500/10 border-pink-500/30" 
                          : "bg-zinc-950 border-zinc-800/50 hover:border-zinc-700"
                      )}
onClick={() => {
                              if (item.status === 'complete') {
                                const activeVer = activeVersion === 'v4' ? item.v4 : item.v35;
                                const fallbackVer = activeVersion === 'v4' ? item.v35 : item.v4;
                                const versionToUse = activeVer?.audioUrl ? activeVer : fallbackVer;
                                setCurrentSong({
                                  ...item,
                                  audioUrl: versionToUse?.audioUrl || item.audioUrl,
                                  imageUrl: versionToUse?.imageUrl || item.imageUrl,
                                  lyrics: versionToUse?.lyrics || item.lyrics,
                                  timestampedLyrics: versionToUse?.timestampedLyrics,
                                });
                              }
                            }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center overflow-hidden">
                        {item.status === 'generating' ? (
                          <Loader2 className="w-5 h-5 animate-spin text-pink-500" />
                        ) : item.genre === 'Voice Clone' ? (
                          <Mic2 className="w-5 h-5 text-pink-500" />
                        ) : item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Music className="w-5 h-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">{item.title}</div>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                          {item.genre} • {item.status === 'complete' ? 'Ready' : item.status === 'generating' ? 'Creating...' : 'Failed'}
                        </div>
                      </div>
                      {item.status === 'complete' && (
                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                          <Play className="w-3 h-3 fill-zinc-400" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />

      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Generate Lyric Video</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-pink-500/50 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-pink-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-pink-500" />
              </div>
              <div className="text-center">
                <div className="text-sm font-bold">Custom Image</div>
                <div className="text-[10px] text-zinc-500 mt-1">Upload from device</div>
              </div>
            </button>

            <button
              onClick={() => handleGenerateVideo()}
              className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-purple-500/50 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ImageIcon className="w-6 h-6 text-purple-500" />
              </div>
              <div className="text-center">
                <div className="text-sm font-bold">Cover Image</div>
                <div className="text-[10px] text-zinc-500 mt-1">Use music cover</div>
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              onClick={() => setShowVideoDialog(false)}
              className="text-zinc-500 hover:text-white"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
