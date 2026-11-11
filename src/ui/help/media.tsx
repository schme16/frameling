// The picture or short video at the top of a help topic. Pictures are plain <img>. Videos loop quietly, with a
// play/pause button, and don't start by themselves when the person asked for less motion (the poster shows instead).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { reducedMotion, usePrefs } from '../prefs';
import './media.css';

const VIDEO = /\.(mp4|webm)$/i;

/** Where the still shown before a video plays (and for reduced motion) lives: `x.mp4` has `x-poster.png`. */
export function posterFor(media: string): string {
  return media.replace(VIDEO, '-poster.png');
}

export function isVideo(media: string): boolean {
  return VIDEO.test(media);
}

export function HelpMedia({ media, title }: { media: string; title: string }) {
  if (!isVideo(media)) return <img className="ui-help-media" src={`help/${media}`} alt={`${title}: a picture of it in Frameling`} />;
  return <HelpVideo media={media} title={title} />;
}

function HelpVideo({ media, title }: { media: string; title: string }) {
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
  }, [calm, media]);

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
        src={`help/${media}`}
        poster={`help/${posterFor(media)}`}
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
