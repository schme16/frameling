// The one place the io and export areas talk to the toast system, so a change there is a one-file fix here.
import { toast, type ToastKind } from '../ui/toast';

export function notify(message: string, kind: ToastKind = 'info', action?: { label: string; run: () => void }, duration?: number): void {
  toast(message, { kind, action, duration });
}
