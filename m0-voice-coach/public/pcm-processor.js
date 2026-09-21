class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const inputSampleRate = options?.processorOptions?.inputSampleRate ?? sampleRate;
    const targetSampleRate = 16000;
    this.ratio = inputSampleRate / targetSampleRate;
    this.buffer = new Float32Array();
    // Output-domain accumulator: hold resampled 16 kHz PCM16 samples until a
    // full ~100 ms chunk is ready. AssemblyAI requires 50-1000 ms per message.
    this.pending = new Int16Array(0);
    this.CHUNK_SAMPLES = 1600; // 100 ms @ 16 kHz (3200 bytes mono PCM16)
    this.MIN_SAMPLES = 800; // 50 ms @ 16 kHz; never emit less while streaming
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      // Append new samples to buffer
      const newBuffer = new Float32Array(this.buffer.length + input.length);
      newBuffer.set(this.buffer);
      newBuffer.set(input, this.buffer.length);
      this.buffer = newBuffer;

      // Resample buffered input to 16 kHz PCM16
      const outputLength = Math.floor(this.buffer.length / this.ratio);
      if (outputLength > 0) {
        const resampled = new Int16Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
          const sample = this.buffer[Math.floor(i * this.ratio)] ?? 0;
          resampled[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
        }

        // Remove consumed samples from buffer
        const consumed = Math.floor(outputLength * this.ratio);
        if (consumed > 0) {
          this.buffer = this.buffer.slice(consumed);
        }

        // Accumulate and emit fixed ~100 ms chunks only
        const merged = new Int16Array(this.pending.length + resampled.length);
        merged.set(this.pending);
        merged.set(resampled, this.pending.length);
        this.pending = merged;

        while (this.pending.length >= this.CHUNK_SAMPLES) {
          const chunk = this.pending.slice(0, this.CHUNK_SAMPLES);
          this.pending = this.pending.slice(this.CHUNK_SAMPLES);
          this.port.postMessage(chunk.buffer, [chunk.buffer]);
        }
      }
    } else if (this.pending.length >= this.MIN_SAMPLES) {
      // Input gone (node disconnected): flush the remainder, which is
      // <1600 samples here since full chunks were already emitted above.
      // Only flush if it meets the 50 ms minimum; a shorter tail cannot be
      // sent and is dropped rather than emitted as a violating chunk.
      const chunk = this.pending;
      this.pending = new Int16Array(0);
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);