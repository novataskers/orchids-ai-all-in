import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Removed Supabase/Auth check
    const { prompt } = await req.json();
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    if (mistralApiKey) {
      try {
        console.log('Generating lyrics with Mistral AI');
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mistralApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'mistral-small-latest',
            messages: [
              {
                role: 'user',
                content: `Write catchy song lyrics based on this prompt: "${prompt}". 
                Structure it with [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus]. 
                Only return the lyrics text, nothing else.`
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.choices?.[0]?.message?.content) {
            const lyrics = data.choices[0].message.content.trim();
            return NextResponse.json({ lyrics });
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          console.error('Mistral AI Lyrics API Error:', errData);
        }
      } catch (err) {
        console.error('Mistral AI Lyrics Error:', err);
      }
    }

    // Fallback mock lyrics if API fails
    const lyrics = `[Verse 1]\n${prompt || 'Walking down the neon street'}\nThe rain is falling at my feet\nEchoes of a distant dream\nNothing's quite what it may seem\n\n[Chorus]\nOh, the rhythm of the night\nEverything will be alright\nLost within the city glow\nWhere the neon rivers flow\n\n[Verse 2]\nStatic in the midnight air\nFading whispers everywhere\nChasing shadows in the dark\nSearching for a tiny spark`;

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error('Lyrics Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate lyrics' }, { status: 500 });
  }
}
