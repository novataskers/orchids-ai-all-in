"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Image as ImageIcon, 
  Video, 
  UserSquare2, 
  Layers, 
  Maximize2, 
  UserCircle2, 
  Monitor, 
  Zap,
  Sparkles,
  ArrowRight,
  Plus,
  Eraser,
  Wand2,
  Play,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const features = [
  { id: "text-video", name: "AI Video Generation", icon: Video, description: "Create stunning videos from text prompts.", color: "text-purple-400" },
  { id: "text-image", name: "AI Image Generation", icon: ImageIcon, description: "Generate high-fidelity images with premium models.", color: "text-blue-400" },
  { id: "avatars", name: "AI Avatars", icon: UserSquare2, description: "Realistic avatars with natural voice synthesis.", color: "text-green-400" },
  { id: "background", name: "Image Tools", icon: Layers, description: "Background removal and editing suite.", color: "text-orange-400" },
  { id: "upscale", name: "Image Upscaler", icon: Maximize2, description: "Enhance resolution up to 8K with AI.", color: "text-pink-400" },
  { id: "faceswap", name: "Face Swapper", icon: UserCircle2, description: "Seamless face replacement in photos and videos.", color: "text-red-400" },
  { id: "recorder", name: "Screen Recorder", icon: Monitor, description: "Professional screen capturing with AI enhancements.", color: "text-cyan-400" },
  { id: "img-to-vid", name: "Animation Maker", icon: Zap, description: "Animate static images into cinematic videos.", color: "text-yellow-400" },
];

const models = ["VEO 3", "Wan 4.3", "Sora 2.2", "Flow", "Premium XL", "Ultra Real"];

export default function InvideoPage() {
  const [activeTab, setActiveTab] = useState("text-video");

  return (
    <div className="p-8 lg:p-12">
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400">
            <Video className="w-3 h-3 mr-1" /> Video Expert Clone
          </Badge>
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">Invideo AI Studio</h1>
        <p className="text-zinc-400 max-w-2xl">
          The ultimate creative engine powered by the world's most advanced AI models. 
          Generate, edit, and animate with professional precision.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Mini Navigation */}
        <div className="lg:col-span-3 space-y-2">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={() => setActiveTab(feature.id)}
              className={cn(
                "w-full flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 text-left",
                activeTab === feature.id
                  ? "bg-purple-500/10 border-purple-500/50 text-white"
                  : "bg-zinc-900/30 border-zinc-800/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50"
              )}
            >
              <feature.icon className={cn("w-5 h-5", activeTab === feature.id ? feature.color : "")} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{feature.name}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Workspace */}
        <div className="lg:col-span-9">
          <Card className="bg-zinc-900/50 border-zinc-800 p-8 h-full min-h-[600px] flex flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 flex flex-col"
              >
                {activeTab === "text-video" && (
                  <div className="space-y-6 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-2xl font-bold text-white">AI Video Generation</h2>
                    </div>

                    <div className="flex-1 flex flex-col gap-6">
                      <div className="space-y-3">
                        <Label className="text-zinc-400 uppercase text-[10px] tracking-widest font-bold">Your Prompt</Label>
                        <textarea 
                          className="w-full h-32 bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                          placeholder="Describe the cinematic masterpiece you want to create..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <Label className="text-zinc-400 uppercase text-[10px] tracking-widest font-bold">Duration (Seconds)</Label>
                          <Slider defaultValue={[10]} max={60} step={1} className="py-4" />
                          <div className="flex justify-between text-xs text-zinc-500">
                            <span>5s</span>
                            <span>60s</span>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <Label className="text-zinc-400 uppercase text-[10px] tracking-widest font-bold">Aspect Ratio</Label>
                          <div className="flex gap-2">
                            {["16:9", "9:16"].map(ratio => (
                              <Button key={ratio} variant="outline" className="flex-1 border-zinc-800 bg-zinc-900/50 hover:bg-purple-500/10 hover:border-purple-500/30">
                                {ratio}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto flex gap-4">
                        <Button className="flex-1 h-14 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg gap-2 shadow-lg shadow-purple-900/20">
                          <Wand2 className="w-5 h-5" /> Generate Video
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "background" && (
                  <div className="space-y-8 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-2xl font-bold text-white">Background Editor</h2>
                      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">New Tool</Badge>
                    </div>

                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-950/30 hover:bg-zinc-900/30 transition-colors group cursor-pointer">
                      <div className="text-center p-12">
                        <div className="w-20 h-20 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                          <Upload className="w-10 h-10 text-zinc-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Upload your image</h3>
                        <p className="text-zinc-500 mb-8">Drop your image here or browse files. Supports PNG, JPG, WEBP.</p>
                        <Button variant="outline" className="border-zinc-800">Choose File</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="secondary" className="h-12 gap-2">
                        <Eraser className="w-4 h-4" /> Remove Background
                      </Button>
                      <Button variant="outline" className="h-12 gap-2 border-zinc-800">
                        <Plus className="w-4 h-4" /> Replace Background
                      </Button>
                    </div>
                  </div>
                )}

                {/* Other tabs can be implemented similarly with specialized UI */}
                {activeTab !== "text-video" && activeTab !== "background" && (
                  <div className="flex flex-col items-center justify-center flex-1 text-center">
                    <div className="w-20 h-20 rounded-full bg-zinc-800/50 flex items-center justify-center mb-6">
                      {React.createElement(features.find(f => f.id === activeTab)?.icon || Video, { className: "w-10 h-10 text-zinc-400" })}
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{features.find(f => f.id === activeTab)?.name}</h3>
                    <p className="text-zinc-500 max-w-sm mb-8">{features.find(f => f.id === activeTab)?.description}</p>
                    <Button className="bg-purple-600 hover:bg-purple-700">Open Studio</Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  );
}
