// Sample-clip streamer for hands-free M1 testing.
//
// Plays a bundled WAV file (real speech) through the SAME AssemblyAI
// WebSocket path as the microphone: 16 kHz mono PCM16 binary frames paced at
// real-time speed in fixed ~100 ms (1600-sample) chunks. AssemblyAI requires
// 50–1000 ms per binary message, so the final short tail (<800 samples) is
// dropped rather than sent as a violating chunk.
//
// chunkPCM16() is pure and unit-tested. streamSampleFile() is browser-only
// (fetch + AudioContext) and is validated manually via the Test samples UI.
//
// UMD: browser global via <script> tag, require()-able in Node for tests.

function chunkPCM16(int16, chunkSize, minSize) {
  const size = chunkSize || 1600;
  const min = minSize || 800; // 50 ms @ 16 kHz: never emit less while streaming
  const chunks = [];
  let i = 0;
  for (; i + size <= int16.length; i += size) {
    chunks.push(int16.slice(i, i + size));
  }
  const rest = int16.length - i;
  // A final partial chunk is still API-valid if >= 50 ms; anything shorter
  // is an unsendable tail and is reported (not sent).
  let tail = 0;
  if (rest >= min) {
    chunks.push(int16.slice(i));
  } else {
    tail = rest;
  }
  return { chunks, tail };
}

async function streamSampleFile({ url, audioCtx, ws, chunkSize, intervalMs, onStatus, isOpen, monitor }) {
  const size = chunkSize || 1600;
  const gap = intervalMs || 100;
  const open = isOpen || (() => ws && ws.readyState === WebSocket.OPEN);

  onStatus && onStatus('Loading sample…');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Sample fetch returned ' + res.status);
  const raw = await res.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(raw);

  // Resample to 16 kHz mono regardless of the file's native rate.
  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const float32 = rendered.getChannelData(0);

  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = Math.round(s * 32767);
  }
  const { chunks, tail } = chunkPCM16(pcm16, size);

  // Optional monitor: play the clip through the speakers as it streams, so
  // hands-free testing is audible. The caller is responsible for pausing mic
  // capture meanwhile (see playSample) to avoid double-feeding AssemblyAI.
  let monitorSrc = null;
  if (monitor) {
    monitorSrc = audioCtx.createBufferSource();
    monitorSrc.buffer = decoded;
    monitorSrc.connect(audioCtx.destination);
  }

  let i = 0;
  let stopped = false;
  onStatus && onStatus('Streaming sample… (' + (chunks.length * size / targetRate).toFixed(0) + 's)');
  if (monitorSrc) { try { monitorSrc.start(); } catch (e) { /* ignore */ } }
  await new Promise((resolve) => {
    const sendNext = () => {
      if (stopped || !open()) { resolve(); return; }
      if (i >= chunks.length) { resolve(); return; }
      ws.send(chunks[i].buffer);
      i++;
      setTimeout(sendNext, gap);
    };
    sendNext();
  });
  const droppedMs = tail > 0 ? Math.round((tail / targetRate) * 1000) : 0;
  onStatus && onStatus('Sample finished.' + (droppedMs ? ' (dropped ' + droppedMs + ' ms trailing tail — below the 50 ms minimum)' : ''));
  return {
    stop() {
      stopped = true;
      try { monitorSrc && monitorSrc.stop(); } catch (e) { /* already stopped */ }
    },
    chunksSent: i,
    droppedTailSamples: tail,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chunkPCM16, streamSampleFile };
}
