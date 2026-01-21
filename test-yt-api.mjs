const RAPIDAPI_KEY = "a61c096b5amshe5eed3b597afba7p1aabe3jsn4a5009a47098";

async function test() {
  console.log("Testing RapidAPI ytstream...");
  try {
    const res = await fetch("https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=dQw4w9WgXcQ", {
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com"
      }
    });
    const data = await res.json();
    console.log("Status:", data.status);
    
    if (data.formats && data.formats.length > 0) {
      console.log("Formats available:", data.formats.length);
      
      // Get the first mp4 format which usually has both audio and video
      const mp4 = data.formats.find(f => f.mimeType && f.mimeType.includes("video/mp4"));
      
      if (mp4 && mp4.url) {
        console.log("Found format:", mp4.qualityLabel, mp4.mimeType.slice(0, 50));
        console.log("URL:", mp4.url.slice(0, 100) + "...");
        
        const videoRes = await fetch(mp4.url);
        console.log("Download status:", videoRes.status);
        if (videoRes.ok) {
          const buffer = await videoRes.arrayBuffer();
          console.log("Downloaded size:", (buffer.byteLength / 1024 / 1024).toFixed(2), "MB");
        }
      }
    }
    
    // Also check adaptiveFormats
    if (data.adaptiveFormats) {
      console.log("\nAdaptive formats available:", data.adaptiveFormats.length);
      const videoFormats = data.adaptiveFormats.filter(f => f.mimeType && f.mimeType.includes("video/mp4"));
      console.log("MP4 video formats:", videoFormats.length);
      videoFormats.forEach(f => console.log("  -", f.qualityLabel, f.mimeType?.slice(0, 40)));
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

test();
