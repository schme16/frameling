// The one place the io and export areas talk to the toast system, so a change there is a one-file fix here.
import type { QuillAnim } from '../ui/mascot/timing';
import type { SoundCue } from '../ui/sounds';
import { whenSaved } from '../platform';
import { toast, type ToastAction, type ToastKind } from '../ui/toast';

export function notify(message: string, kind: ToastKind = 'info', action?: ToastAction, duration?: number, quill?: QuillAnim | null, sound?: SoundCue | null): void {
  toast(message, { kind, action, duration, quill, sound });
}

/** Like `notify`, for a message that says a file was saved or exported: it waits until the browser really has the file. */
export function notifySaved(message: string, kind: ToastKind = 'info', action?: ToastAction, duration?: number, quill?: QuillAnim | null, sound?: SoundCue | null): void {
  whenSaved(() => notify(message, kind, action, duration, quill, sound));
}
