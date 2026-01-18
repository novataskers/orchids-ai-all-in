import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  return NextResponse.json([]);
}

async function generateWithModel(model: string, prompt: string, genre: string, apiKey: string) {
  const hasLyricsBrackets = prompt.includes('[') || prompt.includes(']');
  
  const body: any = {
    model: model,
    instrumental: false,
    customMode: hasLyricsBrackets,
    callBackUrl: "https://example.com/callback",
  };

  if (hasLyricsBrackets) {
    body.prompt = prompt;
    body.style = `${genre || "pop"}, short song, under 2 minutes`;
    body.title = prompt.split('\n')[0].slice(0, 80).replace(/[\[\]]/g, '') || "AI Song";
  } else {
    body.prompt = `${prompt}. Style: ${genre || 'pop'}. Create a short song under 2 minutes with vocals.`;
  }

  console.log(`KIE AI ${model} Request:`, JSON.stringify(body));

  const response = await fetch('https://api.kie.ai/api/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log(`KIE AI ${model} Raw Response:`, responseText);

  if (!response.ok) {
    console.error(`KIE AI ${model} Error:`, responseText);
    return { error: true, message: responseText };
  }

  const result = JSON.parse(responseText);
  
  if (result.code && result.code !== 200) {
    console.error(`KIE AI ${model} API Error:`, result.msg);
    return { error: true, message: result.msg };
  }

  const taskId = result.data?.taskId || result.taskId || result.id;
  return { taskId, model };
}

export async function POST(req: Request) {
  try {
    const { prompt, genre, energy } = await req.json();
    const apiKey = process.env.KIE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        error: 'No KIE AI API Key', 
        message: 'Please add KIE_AI_API_KEY to your environment variables.' 
      }, { status: 500 });
    }

    console.log('Starting KIE AI generation for V4_5 and V4');
    
    const [v4Result, v45Result] = await Promise.all([
      generateWithModel("V4", prompt, genre, apiKey),
      generateWithModel("V4_5", prompt, genre, apiKey),
    ]);

    if (v4Result.error && v45Result.error) {
      return NextResponse.json({ 
        error: 'KIE AI Error', 
        message: v4Result.message || v45Result.message || 'Failed to generate with both models',
        status: 'error'
      }, { status: 500 });
    }

    return NextResponse.json({ 
      v35Id: v4Result.taskId || null,
      v4Id: v45Result.taskId || null,
    });

  } catch (error: any) {
    console.error('Music Generation Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate music',
      message: error.message 
    }, { status: 500 });
  }
}
