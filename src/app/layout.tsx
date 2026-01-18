import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OmniAI - All-in-One AI Creative Suite",
  description: "Generate video, music, and split clips with the power of AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
        <html lang="en" className="dark" suppressHydrationWarning>
          <head>
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&display=swap" rel="stylesheet" />
          </head>
          <body className={inter.className} style={{ overflow: "hidden" }} suppressHydrationWarning>
            <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto relative bg-[#09090b]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
