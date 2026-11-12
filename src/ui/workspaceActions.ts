// The things a person does with a workspace file or text: save one, add one from a file or pasted text, copy one,
// step to the next. The model is in dock.ts and workspaceFile.ts; this adds the file picker, the clipboard and the toasts.
import { download, pickUpload } from '../platform';
import { applyWorkspace, currentWorkspace, dock, importWorkspace, listWorkspaces, workspaceText } from './dock';
import { MAX_WORKSPACE_BYTES, workspaceFileName } from './workspaceFile';
import { toast } from './toast';

const nameOf = (id?: string): string => (id ? listWorkspaces().find((w) => w.id === id)?.name : currentWorkspace()?.name) ?? 'My workspace';

/** Saves a workspace (or the layout as it is now) to a file to share. */
export function exportWorkspaceFile(id?: string): void {
  const text = workspaceText(id);
  if (!text) return void toast('That workspace is gone.', { kind: 'warn' });
  download(workspaceFileName(nameOf(id)), new TextEncoder().encode(text));
  toast(`Saved ${nameOf(id)} as a file you can share.`, { kind: 'success' });
}

/** Tells the person what an import did, with a way to use it straight away. */
function reportImport(r: ReturnType<typeof importWorkspace>): boolean {
  if (!r.ok) {
    toast(r.error, { kind: 'warn' });
    return false;
  }
  const id = r.workspace.id;
  toast(`Added "${r.workspace.name}" to your workspaces.`, { kind: 'success', action: { label: 'Use it', run: () => void applyWorkspace(id) } });
  return true;
}

/** Asks for a workspace file and adds it. */
export async function importWorkspaceFile(): Promise<boolean> {
  const file = await pickUpload('.json,application/json');
  if (!file) return false;
  if (file.size > MAX_WORKSPACE_BYTES) {
    toast('That file is too big to be a workspace.', { kind: 'warn' });
    return false;
  }
  let text = '';
  try {
    text = await file.text();
  } catch {
    toast('That file could not be opened.', { kind: 'warn' });
    return false;
  }
  return reportImport(importWorkspace(text));
}

/** Adds a workspace from text that was pasted. */
export function importWorkspaceFromText(text: string): boolean {
  return reportImport(importWorkspace(text));
}

/** Puts a workspace on the clipboard as text, to paste into a message. */
export async function copyWorkspaceText(id?: string): Promise<boolean> {
  const text = workspaceText(id);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${nameOf(id)} as text. Paste it into a message to share it.`, { kind: 'success' });
    return true;
  } catch {
    toast('Could not reach the clipboard. Use Export to save a file instead.', { kind: 'warn' });
    return false;
  }
}

/** Reads the clipboard and adds the workspace in it. Returns false when it couldn't read it (the Workspaces page has a box to paste into). */
export async function pasteWorkspaceText(): Promise<boolean> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return false;
  }
  return reportImport(importWorkspace(text));
}

/** The next (or previous) workspace in the list, wrapping round. */
export function stepWorkspace(by: 1 | -1): void {
  const list = listWorkspaces();
  const at = list.findIndex((w) => w.id === dock.get().workspaceId);
  const to = list[(at + by + list.length) % list.length];
  if (!to) return;
  applyWorkspace(to.id);
  toast(`${to.name} workspace`, { duration: 1800 });
}
