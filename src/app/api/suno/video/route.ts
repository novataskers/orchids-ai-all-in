import { NextResponse } from "next/server";
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: "Audio URL is required" }, { status: 400 });
    }

    console.log("Starting video generation for:", audioUrl);

    const output = await replicate.run(
      "fofr/audio-to-waveform:15b16b413ddf59514a9e379f9ed64fe8406e9d4179e6ba39347299735a0ef934",
      {
        input: {
          audio: audioUrl,
          bg_color: "#000000",
          fg_alpha: 1,
          bars_color: "#ec4899",
          bar_count: 100,
          bar_width: 0.4,
          caption_text: ""
        }
      }
    );

    console.log("Video generation output:", output);

    if (output && typeof output === 'string') {
      return NextResponse.json({ videoUrl: output, success: true });
    }

    if (output && typeof output === 'object' && 'url' in (output as any)) {
      return NextResponse.json({ videoUrl: (output as any).url, success: true });
    }

    return NextResponse.json({ 
      error: "Unexpected response format from video generation",
      details: JSON.stringify(output)
    }, { status: 500 });

  } catch (error: any) {
    console.error("Video Generation Error:", error);
    return NextResponse.json({ 
      error: "Failed to generate video", 
      details: error.message 
    }, { status: 500 });
  }
}
