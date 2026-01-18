import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const audioId = searchParams.get('audioId') || searchParams.get('songId');

    if (!taskId || !audioId) {
      return NextResponse.json({ error: 'Missing taskId or audioId parameter' }, { status: 400 });
    }

    const apiKey = process.env.KIE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    const response = await fetch('https://api.kie.ai/api/v1/generate/get-timestamped-lyrics', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ taskId, audioId })
    });

    if (!response.ok) {
      console.error('Aligned lyrics API error:', response.status, await response.text());
      return NextResponse.json({ error: 'Failed to fetch aligned lyrics' }, { status: response.status });
    }

    const data = await response.json();
    console.log('Aligned lyrics response:', JSON.stringify(data).slice(0, 500));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Aligned lyrics error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
