"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Video, 
  Scissors, 
  Music, 
  Home, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "Home", href: "/", icon: Home },
  { name: "Invideo Hub", href: "/invideo", icon: Video, color: "text-purple-400" },
  { name: "Opus Clips", href: "/opus", icon: Scissors, color: "text-blue-400" },
  { name: "Suno Studio", href: "/suno", icon: Music, color: "text-pink-400" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div 
      className={cn(
        "relative flex flex-col h-full border-r border-zinc-800 bg-[#0c0c0e] transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!collapsed && <span className="text-xl font-bold text-white tracking-tight">OmniAI</span>}
      </div>

      <div className="flex-1 px-3 space-y-1">
        {navItems.map((item: any) => {
          const content = (
            <div 
              className={cn(
                "group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                pathname === item.href 
                  ? "bg-zinc-800/50 text-white" 
                  : "text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", pathname === item.href ? item.color : "")} />
              {!collapsed && <span className="font-medium">{item.name}</span>}
            </div>
          );

          return (
            <Link key={item.href} href={item.href}>
              {content}
            </Link>
          );
        })}
      </div>

      <div className="p-4 space-y-2 border-t border-zinc-800/50">
        <Button 
          variant="ghost" 
          className={cn(
            "w-full justify-start gap-3 px-3 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-xl",
            collapsed && "justify-center"
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <><ChevronLeft className="w-5 h-5" /> <span>Collapse</span></>}
        </Button>
      </div>
    </div>
  );
}
