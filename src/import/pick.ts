// Asking for files with the window's own picker: one or several files, or a whole folder. Works in the desktop app and in
// a browser; the page only gets what was picked.

/** Opens the picker. Resolves with nothing when it is cancelled. For a folder, each file's path is inside the folder ("frames/a.png" as "a.png"). */
export function pickFiles(accept: string, opts: { multiple?: boolean; folder?: boolean } = {}): Promise<{ path: string; file: File }[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts.folder) input.webkitdirectory = true;
    else {
      input.accept = accept;
      input.multiple = !!opts.multiple;
    }
    input.addEventListener(
      'change',
      () =>
        resolve(
          [...(input.files ?? [])].map((file) => {
            const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
            // The first part is the folder that was picked: leave it off.
            return { path: rel ? rel.slice(rel.indexOf('/') + 1) : file.name, file };
          }),
        ),
      { once: true },
    );
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

/** The name of the folder that was picked, from the first file's relative path (empty when there is none). */
export function folderNameOf(files: { file: File }[]): string {
  const rel = (files[0]?.file as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath;
  return rel && rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
}
