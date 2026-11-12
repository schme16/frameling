// What every format's making shares: the context it is given, what it hands back, and the helpers for staying
// responsive and for cancelling. Kept apart from run.ts so a format can be loaded without the rest.
import type { Doc } from '../core/format';
import type { VideoCodec } from 'mediabunny';
import type { ExportSettings } from './types';

export interface Progress {
  done: number;
  total: number;
  /** What is happening, in friendly words. */
  label: string;
}

export interface RunContext {
  doc: Doc;
  settings: ExportSettings;
  /** The frame being looked at (for "this frame"). */
  currentFrame: number;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
  /** Which video codec to use, from detectCapabilities (the dialog checked it already). */
  videoCodec?: VideoCodec | null;
  /** Whether the chosen video codec can keep a see-through background. */
  videoAlpha?: boolean;
  appVersion?: string;
  /** Turns an MP4's Opus sound into AAC (ffmpeg on the desktop), or gives null. */
  toAac?: (bytes: Uint8Array) => Promise<Uint8Array | null>;
}

export type RunResult =
  | { kind: 'file'; name: string; bytes: Uint8Array; /** Something worth telling them about the result (the video has no sound, say). */ note?: string }
  | { kind: 'files'; folderName: string; files: { name: string; bytes: Uint8Array }[]; /** The file to point at afterwards. */ main: string };

export function isCancelled(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export const cancelled = (): DOMException => new DOMException('Export cancelled', 'AbortError');

/** Lets the window breathe (progress bar, Cancel button) between frames. */
export async function breathe(signal: AbortSignal, i: number): Promise<void> {
  if (signal.aborted) throw cancelled();
  if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  if (signal.aborted) throw cancelled();
}
