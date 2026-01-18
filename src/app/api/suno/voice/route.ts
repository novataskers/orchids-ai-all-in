import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VOICE_MAP: Record<string, string> = {
  'Serena': '21m00Tcm4TlvDq8ikWAM', // Rachel
  'Marcus': 'pNInz6obpgDQGcFmaJgB', // Adam
  'Luna': 'EXAVITQu4vr4xnSDxMaL',   // Bella
};

export async function POST(req: Request) {
  try {
    const { text, voiceName } = await req.json();
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      return NextResponse.json({ 
        error: 'ElevenLabs API Key missing',
        message: 'Please add ELEVENLABS_API_KEY to your .env file.'
      }, { status: 500 });
    }

    const voiceId = VOICE_MAP[voiceName] || VOICE_MAP['Serena'];

    console.log(`Generating voice with ElevenLabs for: ${voiceName} (${voiceId})`);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json',
        'accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('ElevenLabs API Error:', errorData);
      return NextResponse.json({ 
        error: 'ElevenLabs API Error', 
        message: errorData.detail?.message || 'Failed to generate speech' 
      }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Upload to Supabase Storage
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileName = `voice_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('music')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase Storage Upload Error:', uploadError);
      return NextResponse.json({ 
        error: 'Storage Error', 
        message: 'Failed to upload generated audio' 
      }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('music')
      .getPublicUrl(fileName);

    return NextResponse.json({ 
      id: fileName, 
      audio_url: publicUrl 
    });

  } catch (error: any) {
    console.error('Voice Generation Error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: error.message 
    }, { status: 500 });
  }
}
