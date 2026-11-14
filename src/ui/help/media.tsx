// The picture or short video at the top of a help topic. Pictures are plain <img>. Videos loop quietly, with a
// play/pause button, and don't start by themselves when the person asked for less motion (the poster shows instead).
//
// Every picture and clip exists twice, once for each mode: a topic names `select.png` and the files are
// `select-dark.png` and `select-light.png` (a clip's poster follows: `tour-dark-poster.png`). The one shown matches the
// mode the app is in right now, and changes with it, including when Auto follows the computer going dark or light.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { effectiveTheme, reducedMotion, usePrefs } from '../prefs';
import './media.css';

const VIDEO = /\.(mp4|webm)$/i;

export type HelpMode = 'dark' | 'light';
export const HELP_MODES: readonly HelpMode[] = ['dark', 'light'];

/** The file for one mode: `x.png` becomes `x-dark.png`, `x.mp4` becomes `x-light.mp4`. */
export function modeFile(media: string, mode: HelpMode): string {
  return media.replace(/(\.[a-z0-9]+)$/i, `-${mode}$1`);
}

/** Every file a topic's media needs: both modes, and a poster for each when it's a clip. */
export function mediaFiles(media: string): string[] {
  return HELP_MODES.flatMap((m) => {
    const f = modeFile(media, m);
    return isVideo(media) ? [f, posterFor(f)] : [f];
  });
}

/** Dark or light as it is now. Follows the mode setting, and the computer's own while the mode is Auto. */
export function useHelpMode(): HelpMode {
  usePrefs((p) => p.theme);
  const [, again] = useState(0);
  useEffect(() => {
    try {
      const q = window.matchMedia('(prefers-color-scheme: dark)');
      const changed = () => again((n) => n + 1);
      q.addEventListener('change', changed);
      return () => q.removeEventListener('change', changed);
    } catch {
      return undefined; // No matchMedia (tests): nothing to follow.
    }
  }, []);
  return effectiveTheme();
}

/** Where the still shown before a video plays (and for reduced motion) lives: `x.mp4` has `x-poster.png`. */
export function posterFor(media: string): string {
  return media.replace(VIDEO, '-poster.png');
}

export function isVideo(media: string): boolean {
  return VIDEO.test(media);
}

export function HelpMedia({ media, title }: { media: string; title: string }) {
  const file = modeFile(media, useHelpMode());
  if (!isVideo(media)) return <img className="ui-help-media" src={`help/${file}`} alt={`${title}: a picture of it in Frameling`} />;
  return <HelpVideo file={file} title={title} />;
}

function HelpVideo({ file, title }: { file: string; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  // Re-read when the Reduce motion switch changes. The computer's own setting is read by reducedMotion().
  usePrefs((p) => p.reduceMotion);
  const calm = reducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (calm) v.pause();
    else void v.play().catch(() => setPlaying(false));
  }, [calm, file]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  return (
    <figure className="ui-help-media ui-help-video">
      <video
        ref={video}
        src={`help/${file}`}
        poster={`help/${posterFor(file)}`}
        autoPlay={!calm}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={`${title}: a short video of it in Frameling`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
      />
      <button type="button" className="ui-icon-btn ui-help-video-btn" aria-label={playing ? 'Pause the video' : 'Play the video'} data-tip={playing ? 'Pause' : 'Play'} onClick={toggle}>
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
    </figure>
  );
}
