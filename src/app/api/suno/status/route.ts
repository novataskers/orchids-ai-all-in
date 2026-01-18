import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
    }

    const apiKey = process.env.KIE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json([{
        id: ids,
        status: 'error',
        message: 'No KIE AI API Key found in environment variables.'
      }]);
    }

    try {
      const url = `https://api.kie.ai/api/v1/generate/record-info?taskId=${ids}`;
      console.log('Polling KIE AI:', url);
      
      const response = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const responseText = await response.text();
      console.log('KIE AI Status Raw Response:', responseText);

      if (!response.ok) {
        console.error('KIE AI Status Error:', responseText);
        return NextResponse.json([{
          id: ids,
          status: 'generating',
        }]);
      }

      const result = JSON.parse(responseText);
      console.log('KIE AI Status Parsed:', JSON.stringify(result));

      const data = result.data || result;
      const status = data?.status?.toUpperCase?.() || result.status?.toUpperCase?.();

      if (status === 'SUCCESS' || status === 'COMPLETE' || status === 'COMPLETED') {
        const responseData = data?.response || data;
        const tracks = responseData?.sunoData || responseData?.data || [];
        const firstTrack = Array.isArray(tracks) ? tracks[0] : tracks;
        
        const audioId = firstTrack?.id || firstTrack?.songId || responseData?.id;
        let timestampedLyrics = null;
        
        if (audioId && apiKey) {
          try {
            console.log('Fetching timestamped lyrics for taskId:', ids, 'audioId:', audioId);
            const alignedRes = await fetch('https://api.kie.ai/api/v1/generate/get-timestamped-lyrics', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ taskId: ids, audioId })
            });
            
            const alignedText = await alignedRes.text();
            console.log('Timestamped lyrics raw response:', alignedText);
            
            if (alignedRes.ok && alignedText) {
              const alignedData = JSON.parse(alignedText);
              console.log('Timestamped lyrics parsed:', JSON.stringify(alignedData).slice(0, 500));
              
              const alignedWords = alignedData?.data?.alignedWords || 
                                  alignedData?.alignedWords || 
                                  alignedData?.data?.aligned_words ||
                                  alignedData?.aligned_words ||
                                  (alignedData?.data && Array.isArray(alignedData.data) ? alignedData.data : null);
              
              if (alignedWords && Array.isArray(alignedWords) && alignedWords.length > 0) {
                console.log('Sample aligned word:', JSON.stringify(alignedWords[0]));
                timestampedLyrics = alignedWords.map((w: any) => {
                  const wordText = (w.word || w.text || w.lyric || '').replace(/\[.*?\]\n?/g, '').trim();
                  const startTime = w.startS ?? w.start_s ?? w.start ?? w.startTime ?? 0;
                  const endTime = w.endS ?? w.end_s ?? w.end ?? w.endTime ?? (startTime + 0.3);
                  return {
                    text: wordText,
                    start: typeof startTime === 'number' ? startTime : parseFloat(startTime) || 0,
                    end: typeof endTime === 'number' ? endTime : parseFloat(endTime) || 0
                  };
                }).filter((w: any) => w.text.length > 0);
                console.log('Processed timestamped lyrics:', timestampedLyrics.length, 'words');
                if (timestampedLyrics.length > 0) {
                  console.log('First word:', timestampedLyrics[0]);
                  console.log('Last word:', timestampedLyrics[timestampedLyrics.length - 1]);
                }
              } else {
                console.log('No alignedWords array found in response');
              }
            } else {
              console.log('Timestamped lyrics not available:', alignedRes.status);
            }
          } catch (alignErr) {
            console.error('Failed to fetch timestamped lyrics:', alignErr);
          }
        }
        
        return NextResponse.json([{
          id: ids,
          status: 'complete',
          audio_url: firstTrack?.audioUrl || firstTrack?.streamAudioUrl || firstTrack?.audio_url || responseData?.audioUrl,
          image_url: firstTrack?.imageUrl || firstTrack?.image_url || responseData?.imageUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&q=80',
          title: firstTrack?.title || responseData?.title || 'Generated Song',
          lyrics: firstTrack?.lyrics || firstTrack?.lyric || responseData?.lyrics || responseData?.lyric || firstTrack?.prompt || responseData?.prompt || '',
          timestampedLyrics,
          genre: firstTrack?.tags || responseData?.tags || ''
        }]);
      } else if (status === 'FAILED' || status === 'ERROR' || status === 'FAILURE') {
        return NextResponse.json([{ 
          id: ids, 
          status: 'error', 
          message: data?.errorMessage || data?.error || result.msg || 'Generation failed' 
        }]);
      }

      return NextResponse.json([{
        id: ids,
        status: 'generating',
      }]);

    } catch (err: any) {
      console.error('Polling KIE AI Error:', err);
      return NextResponse.json([{ id: ids, status: 'error', message: err.message }]);
    }

  } catch (error: any) {
    console.error('Status Route Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
