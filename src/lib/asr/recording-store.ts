import "server-only";

import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { uploadDir } from "../assets";

export function recordingDir() {
  return path.join(uploadDir(), "recordings");
}

export function meetingRecordingRelPath(meetingId: string, ext: string) {
  const safeExt = ext.replace(/[^\w]/g, "") || "webm";
  return path.join("recordings", `${meetingId}.${safeExt}`);
}

export async function saveMeetingRecording(opts: {
  meetingId: string;
  buffer: Buffer;
  mimeType?: string;
  filename?: string;
}): Promise<{ relativePath: string; absPath: string; bytes: number; mimeType: string }> {
  const mime = opts.mimeType || "audio/webm";
  const fromName = opts.filename ? path.extname(opts.filename).replace(/^\./, "") : "";
  const ext =
    fromName ||
    (mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("wav")
          ? "wav"
          : mime.includes("mpeg") || mime.includes("mp3")
            ? "mp3"
            : "webm");
  const relativePath = meetingRecordingRelPath(opts.meetingId, ext);
  const absPath = path.join(uploadDir(), relativePath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, opts.buffer);
  return { relativePath, absPath, bytes: opts.buffer.length, mimeType: mime };
}

export async function readMeetingRecording(relativePath: string): Promise<Buffer> {
  const abs = path.join(uploadDir(), relativePath);
  return readFile(abs);
}

export async function deleteMeetingRecording(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    await unlink(path.join(uploadDir(), relativePath));
  } catch {
    /* ignore */
  }
}
