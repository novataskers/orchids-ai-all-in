"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  Video, 
  Scissors, 
  Music, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  Shield, 
  Clock,
  Mic2,
  Image as ImageIcon,
  PlayCircle,
  FileVideo,
  Split,
  Plus
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function Home() {
  return (
    <div className="relative min-h-screen">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-12 lg:px-8">
        <header className="mb-16">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-4"
          >
            <Badge variant="outline" className="px-3 py-1 border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Sparkles className="w-3 h-3 mr-1" /> All-in-One AI Platform
            </Badge>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-5xl lg:text-7xl font-bold tracking-tight text-white mb-6"
          >
            Your Complete <br />
            <span className="gradient-text italic">AI Creative Engine</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-2xl leading-relaxed"
          >
            Unleash the power of state-of-the-art models for video, audio, and content automation. 
            Everything you need to create, edit, and publish, all in one seamless workspace.
          </motion.p>
        </header>

        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24"
        >
          {/* Invideo Section */}
          <motion.div variants={item}>
            <Link href="/invideo">
              <Card className="group relative overflow-hidden bg-zinc-900/50 border-zinc-800 hover:border-purple-500/50 transition-all duration-500 hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)]">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-8">
                  <div className="w-14 h-14 rounded-2xl bg-purple-600/20 flex items-center justify-center mb-6 border border-purple-500/30 group-hover:scale-110 transition-transform duration-500">
                    <Video className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                    Invideo Hub <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-zinc-400 mb-6 line-clamp-2">
                    Premium video & image generation. VEO 3, Sora 2.2, and AI Avatars at your fingertips.
                  </p>
                  <ul className="space-y-2 mb-8">
                    {["Text to Video", "AI Avatars", "Model Suite"].map((feature) => (
                      <li key={feature} className="text-xs text-zinc-500 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-purple-500" /> {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Video Expert</span>
                    <Plus className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>

          {/* Opus Section */}
          <motion.div variants={item}>
            <Link href="/opus">
              <Card className="group relative overflow-hidden bg-zinc-900/50 border-zinc-800 hover:border-blue-500/50 transition-all duration-500 hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-8">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/20 flex items-center justify-center mb-6 border border-blue-500/30 group-hover:scale-110 transition-transform duration-500">
                    <Scissors className="w-7 h-7 text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                    Opus Clips <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-zinc-400 mb-6 line-clamp-2">
                    Transform long-form content into viral shorts. Auto-splitting, captions, and more.
                  </p>
                  <ul className="space-y-2 mb-8">
                    {["12h+ Video Splitter", "Auto-Shorts", "AI Captions"].map((feature) => (
                      <li key={feature} className="text-xs text-zinc-500 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-blue-500" /> {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Content Mastery</span>
                    <Plus className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>

          {/* Suno Section */}
          <motion.div variants={item}>
            <Link href="/suno">
              <Card className="group relative overflow-hidden bg-zinc-900/50 border-zinc-800 hover:border-pink-500/50 transition-all duration-500 hover:shadow-[0_0_40px_-10px_rgba(236,72,153,0.3)]">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-8">
                  <div className="w-14 h-14 rounded-2xl bg-pink-600/20 flex items-center justify-center mb-6 border border-pink-500/30 group-hover:scale-110 transition-transform duration-500">
                    <Music className="w-7 h-7 text-pink-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                    Suno Studio <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-zinc-400 mb-6 line-clamp-2">
                    Generative music and voice. Script to music, voice cloning, and lyrical generation.
                  </p>
                  <ul className="space-y-2 mb-8">
                    {["Text to Music", "Voice Cloning", "Lyrics Gen"].map((feature) => (
                      <li key={feature} className="text-xs text-zinc-500 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-pink-500" /> {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-pink-400 uppercase tracking-wider">Audio Engine</span>
                    <Plus className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        </motion.div>

        {/* Feature Grid / Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {[
            { label: "Premium Models", value: "25+", icon: Zap },
            { label: "Processing Speed", value: "Instant", icon: Clock },
            { label: "Enterprise Security", value: "Locked", icon: Shield },
            { label: "Global Users", value: "2M+", icon: Sparkles },
          ].map((stat, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 flex flex-col items-center text-center">
              <stat.icon className="w-5 h-5 text-purple-500 mb-3" />
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
