/** Dropping a sound file anywhere on the window adds it, like File > Import sound. */
import { mimeFor } from './clips';
import { addSound } from './ops';
import { notify } from '../io/notify';

const AUDIO_NAME = /\.(wav|mp3|ogg|oga|opus|m4a|aac|flac|webm)$/i;

const isSound = (f: File) => f.type.startsWith('audio/') || AUDIO_NAME.test(f.name);

const hasSoundFile = (e: DragEvent): boolean => {
  const items = e.dataTransfer?.items;
  if (items && items.length) return [...items].some((i) => i.kind === 'file' && (i.type.startsWith('audio/') || i.type === ''));
  return false;
};

export function installSoundDrop(target: Window = window): () => void {
  const over = (e: DragEvent) => {
    if (e.defaultPrevented || !hasSoundFile(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const drop = (e: DragEvent) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter(isSound);
    if (!files.length) return;
    e.preventDefault();
    void (async () => {
      for (const f of files) {
        const clip = await addSound(new Uint8Array(await f.arrayBuffer()), f.name, mimeFor(f.name, f.type));
        if (clip) notify(`Added "${clip.name}" to the timeline. Drag it to line it up.`, 'success');
      }
    })();
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}
