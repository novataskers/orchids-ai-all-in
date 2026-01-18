export async function generateLyricVideo(
  audioUrl: string, 
  lyrics: string, 
  imageUrl?: string, 
  onProgress?: (percent: number) => void,
  timestampedLyrics?: any
): Promise<string> {
  let audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  
  return new Promise(async (resolve, reject) => {
    try {
      if (onProgress) onProgress(1);
      
      const proxiedUrl = `/api/proxy?url=${encodeURIComponent(audioUrl)}`;
      
      if (onProgress) onProgress(5);
      const response = await fetch(proxiedUrl);
      if (!response.ok) throw new Error("Failed to fetch audio from proxy");
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get reader from response");
      
      const chunks = [];
      while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total && onProgress) {
          const progress = 5 + Math.floor((loaded / total) * 10);
          onProgress(progress);
        }
      }
      
      const blob = new Blob(chunks);
      const arrayBuffer = await blob.arrayBuffer();
      
      if (onProgress) onProgress(15);
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      if (onProgress) onProgress(25);
      let bgImage: HTMLImageElement | null = null;
      if (imageUrl) {
        bgImage = new Image();
        bgImage.crossOrigin = "anonymous";
        bgImage.src = imageUrl;
        await new Promise((res) => {
          bgImage!.onload = res;
          bgImage!.onerror = () => {
            console.warn("Background image failed to load, continuing without it.");
            bgImage = null;
            res(null);
          };
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1280; // Upgraded to 720p
      canvas.height = 720;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Could not get canvas context");

      await audioContext.resume();
      const dest = audioContext.createMediaStreamDestination();
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;
      source.connect(gainNode);
      gainNode.connect(dest);

      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0.001; 
      source.connect(silentGain);
      silentGain.connect(audioContext.destination);

      const supportedTypes = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm'
      ];
      
      let mimeType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      if (!mimeType) throw new Error("No supported video MIME types found");
        
      const videoStream = canvas.captureStream(30);
      const combinedStream = new MediaStream();
      videoStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      dest.stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

      recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000, // Higher quality
        audioBitsPerSecond: 192000
      });

      const videoChunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunks.push(e.data);
      };
      
      recorder.onstop = () => {
        const finalType = mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
        const finalBlob = new Blob(videoChunks, { type: finalType });
        resolve(URL.createObjectURL(finalBlob));
      };

      const duration = audioBuffer.duration;
      console.log("Audio duration:", duration, "seconds");

      let finalLyrics: any[] = [];
      
      if (timestampedLyrics) {
        try {
          const parsed = typeof timestampedLyrics === 'string' ? JSON.parse(timestampedLyrics) : timestampedLyrics;
          const rawItems = Array.isArray(parsed) ? parsed : (parsed.lyrics || parsed.words || []);
          
          if (rawItems.length > 0) {
            console.log("Processing timestamped lyrics:", rawItems.length, "items");
            console.log("Sample items:", JSON.stringify(rawItems.slice(0, 3)));
            
            const processedItems = rawItems.map((item: any) => {
              const start = typeof item.start === 'number' ? item.start : parseFloat(item.start) || 0;
              const end = typeof item.end === 'number' ? item.end : parseFloat(item.end) || start + 0.5;
              return {
                text: (item.text || item.word || item.line || "").trim(),
                start: Math.max(0, start),
                end: Math.max(start + 0.1, end)
              };
            }).filter((l: any) => l.text.length > 0);

            console.log("Processed items:", processedItems.length);
            if (processedItems.length > 0) {
              console.log("Time range:", processedItems[0].start, "to", processedItems[processedItems.length - 1].end);
            }

            const isWordLevel = processedItems.length > 0 && 
              processedItems.every((item: any) => !item.text.includes(' ') || item.text.split(' ').length <= 2);
            
            if (isWordLevel && processedItems.length > 5) {
              console.log("Word-level lyrics detected, grouping into lines...");
              let currentLineWords: any[] = [];
              let currentLineText = "";
              
              for (let i = 0; i < processedItems.length; i++) {
                const word = processedItems[i];
                const prevWord = processedItems[i - 1];
                
                const gap = prevWord ? (word.start - prevWord.end) : 0;
                const isNewLine = gap > 0.6;
                const isLineTooLong = currentLineText.length + word.text.length > 40;

                if ((isNewLine || isLineTooLong) && currentLineWords.length > 0) {
                  finalLyrics.push({
                    text: currentLineText.trim(),
                    start: currentLineWords[0].start,
                    end: currentLineWords[currentLineWords.length - 1].end,
                    words: [...currentLineWords]
                  });
                  currentLineWords = [word];
                  currentLineText = word.text + " ";
                } else {
                  currentLineWords.push(word);
                  currentLineText += word.text + " ";
                }
              }
              if (currentLineWords.length > 0) {
                finalLyrics.push({
                  text: currentLineText.trim(),
                  start: currentLineWords[0].start,
                  end: currentLineWords[currentLineWords.length - 1].end,
                  words: [...currentLineWords]
                });
              }
            } else {
              finalLyrics = processedItems;
            }

            finalLyrics.sort((a, b) => a.start - b.start);
            console.log("Final lyrics lines:", finalLyrics.length);
            if (finalLyrics.length > 0) {
              console.log("First line:", finalLyrics[0].text, "starts at:", finalLyrics[0].start, "s");
              console.log("Last line:", finalLyrics[finalLyrics.length - 1].text, "ends at:", finalLyrics[finalLyrics.length - 1].end, "s");
            }
          }
        } catch (e) {
          console.error("Failed to parse timestamped lyrics", e);
        }
      }

        if (finalLyrics.length === 0 && lyrics) {
          const lyricLines = lyrics.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('['));
          if (lyricLines.length > 0) {
            const avgWordsPerSecond = 2.5;
            const pauseBetweenLines = 1.0;
            
            let currentTime = 3;
            const estimatedLyrics: any[] = [];
            
            for (const line of lyricLines) {
              const wordCount = line.split(/\s+/).length;
              const lineDuration = Math.max(1.5, wordCount / avgWordsPerSecond);
              
              if (currentTime + lineDuration > duration - 2) break;
              
              estimatedLyrics.push({
                text: line,
                start: currentTime,
                end: currentTime + lineDuration
              });
              
              currentTime += lineDuration + pauseBetweenLines;
            }
            
            if (estimatedLyrics.length < lyricLines.length * 0.7) {
              const startOffset = 2;
              const endBuffer = 3;
              const availableTime = duration - startOffset - endBuffer;
              const totalWords = lyricLines.reduce((sum, l) => sum + l.split(/\s+/).length, 0);
              const timePerWord = availableTime / totalWords;
              
              let time = startOffset;
              finalLyrics = lyricLines.map((line) => {
                const wordCount = line.split(/\s+/).length;
                const lineDuration = Math.max(1.2, wordCount * timePerWord);
                const start = time;
                const end = Math.min(time + lineDuration, duration - 1);
                time = end + 0.3;
                return { text: line, start, end };
              });
            } else {
              finalLyrics = estimatedLyrics;
            }
          }
        }

      if (onProgress) onProgress(40);
      
      const syncDelay = 0.5;
      const scheduledStartTime = audioContext.currentTime + syncDelay;
      
      recorder.start();
      source.start(scheduledStartTime);

      const render = () => {
        if (!audioContext) return;
        
        try {
          const elapsedTime = audioContext.currentTime - scheduledStartTime;
          
          if (elapsedTime >= duration) {
            if (recorder?.state === 'recording') recorder.stop();
            source.stop();
            audioContext.close();
            if (onProgress) onProgress(100);
            return;
          }

          if (elapsedTime < 0) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            requestAnimationFrame(render);
            return;
          }

          // Draw background
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          if (bgImage && bgImage.complete) {
            const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
            const x = (canvas.width - bgImage.width * scale) / 2;
            const y = (canvas.height - bgImage.height * scale) / 2;
            ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
            
            const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width * 0.8);
            grad.addColorStop(0, 'rgba(0,0,0,0.4)');
            grad.addColorStop(1, 'rgba(0,0,0,0.8)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          const currentLyric = finalLyrics.find(l => elapsedTime >= l.start && elapsedTime < l.end);
          
          if (currentLyric) {
            const lineDuration = currentLyric.end - currentLyric.start;
            const timeIntoLine = elapsedTime - currentLyric.start;
            const timeUntilEnd = currentLyric.end - elapsedTime;
            
            // snappier transitions
            const fadeInTime = 0.1;
            const fadeOutTime = 0.05; // very fast fade out to avoid "lingering"
            
            let opacity = 1;
            if (timeIntoLine < fadeInTime) {
              opacity = timeIntoLine / fadeInTime;
            } else if (timeUntilEnd < fadeOutTime) {
              opacity = timeUntilEnd / fadeOutTime;
            }
            
            ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Shadow for readability
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            if (currentLyric.words) {
              // Karaoke Rendering
              const fontSize = 56;
              ctx.font = `bold ${fontSize}px sans-serif`;
              
              const totalTextWidth = ctx.measureText(currentLyric.text).width;
              let currentX = (canvas.width / 2) - (totalTextWidth / 2);
              const y = canvas.height / 2;

              currentLyric.words.forEach((wordObj: any) => {
                const isWordActive = elapsedTime >= wordObj.start && elapsedTime < wordObj.end;
                const wordText = wordObj.text + " ";
                const wordWidth = ctx.measureText(wordText).width;

                ctx.fillStyle = isWordActive ? '#ec4899' : '#ffffff'; // Pink highlight for active word
                if (isWordActive) {
                   ctx.shadowBlur = 15;
                   ctx.shadowColor = 'rgba(236, 72, 153, 0.5)';
                } else {
                   ctx.shadowBlur = 10;
                   ctx.shadowColor = 'rgba(0,0,0,0.8)';
                }
                
                ctx.fillText(wordText, currentX + wordWidth/2, y);
                currentX += wordWidth;
              });
            } else {
              // Normal Line Rendering
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 56px sans-serif';
              
              const words = currentLyric.text.split(' ');
              let lines = [];
              let currentLineText = "";
              for (let word of words) {
                if ((currentLineText + word).length > 25) {
                  lines.push(currentLineText.trim());
                  currentLineText = word + " ";
                } else {
                  currentLineText += word + " ";
                }
              }
              lines.push(currentLineText.trim());

              const lineHeight = 70;
              const totalTextHeight = lines.length * lineHeight;
              const startY = (canvas.height / 2) - (totalTextHeight / 2) + (lineHeight / 2);

              lines.forEach((line, i) => {
                const y = startY + (i * lineHeight);
                ctx.fillText(line, canvas.width / 2, y);
              });
            }
            
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          }

          // Watermark
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('SUNO STUDIO AI', canvas.width - 40, canvas.height - 40);

          if (onProgress) onProgress(40 + Math.floor((elapsedTime / duration) * 60));
          requestAnimationFrame(render);
        } catch (err) {
          console.error("Render error:", err);
          reject(err);
        }
      };

      requestAnimationFrame(render);

    } catch (error) {
      console.error("Generator fatal error:", error);
      if (audioContext) audioContext.close();
      reject(error);
    }
  });
}

export async function generateWaveformVideo(audioUrl: string, onProgress?: (percent: number) => void): Promise<string> {
  return generateLyricVideo(audioUrl, "", undefined, onProgress);
}
