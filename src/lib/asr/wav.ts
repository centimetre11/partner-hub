/** 浏览器端 PCM → WAV，供 Whisper/ffmpeg 稳定解码 */

export function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** 从 MediaStream 采集一段 PCM 并编码为 WAV */
export async function recordStreamToWav(
  stream: MediaStream,
  durationMs: number,
): Promise<{ blob: Blob; sampleRate: number }> {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const sampleRate = ctx.sampleRate;
  const chunks: Float32Array[] = [];

  // ScriptProcessor 虽已废弃，但兼容面最广，适合短分片
  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };
  // 接到静音节点，避免回放啸叫，同时保证处理器被调度
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  await new Promise((r) => window.setTimeout(r, durationMs));

  processor.disconnect();
  source.disconnect();
  mute.disconnect();
  await ctx.close().catch(() => undefined);

  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }

  return { blob: encodeWavMono(merged, sampleRate), sampleRate };
}
