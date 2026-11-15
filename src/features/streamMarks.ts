// Things a streamer has done on the Streaming page this session, kept only so the Go live quest can check they really
// happened (a copy that worked, a file that saved). In memory, nothing saved, nothing about anyone but the streamer.
// The quest clears them when it starts, so a step counts only when it is done during the quest.

export type StreamMark = 'doorAddress' | 'setupFile' | 'overlayAddress' | 'overlayTest';

const marks = new Set<StreamMark>();

/** Says that something worked. Called by the button or command itself, only once it has. */
export function noteStreamMark(m: StreamMark): void {
  marks.add(m);
}

export const hasStreamMark = (m: StreamMark): boolean => marks.has(m);

export function resetStreamMarks(): void {
  marks.clear();
}
