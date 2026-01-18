"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { LogIn, UserPlus, Loader2, Mail } from "lucide-react";

interface AuthDialogProps {
  mode: "login" | "register";
  trigger?: React.ReactNode;
}

export function AuthDialog({ mode: initialMode, trigger }: AuthDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUnconfirmed(false);

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        if (data.user && data.session) {
          toast.success("Account created and logged in!");
          setOpen(false);
          router.refresh();
        } else {
          toast.success("Registration successful! Please check your email to verify your account.", {
            duration: 6000
          });
          setMode("login");
          setUnconfirmed(true);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          if (error.message.toLowerCase().includes("confirm")) {
            setUnconfirmed(true);
            throw new Error("Please confirm your email before signing in.");
          }
          throw error;
        }

        toast.success("Logged in successfully!");
        setOpen(false);
        router.refresh();
      }
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full">
            {mode === "login" ? "Login" : "Sign Up"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </DialogTitle>
          </DialogHeader>
          
          {unconfirmed && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3 text-sm text-blue-200">
              <Mail className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">Check your email</p>
                <p className="opacity-80">We've sent a confirmation link to your email. Please click it to activate your account and log in.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-900 border-zinc-800"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-900 border-zinc-800"
              required
            />
          </div>
          <Button 
            type="submit" 
            className="w-full bg-pink-600 hover:bg-pink-700 font-bold"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : mode === "login" ? (
              <LogIn className="w-4 h-4 mr-2" />
            ) : (
              <UserPlus className="w-4 h-4 mr-2" />
            )}
            {mode === "login" ? "Sign In" : "Register"}
          </Button>
          <div className="text-center text-sm text-zinc-500">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="text-pink-400 hover:underline"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-pink-400 hover:underline"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
