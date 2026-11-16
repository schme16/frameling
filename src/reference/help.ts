import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'reference-picture',
    media: 'reference-picture.png',
    title: 'A picture behind your drawing (reference)',
    section: 'Animating',
    summary: 'Put a photo, a model sheet or a mood board behind your drawing to trace or copy from. Move it, size it, turn it, fade it. It never gets exported.',
    keywords: ['reference image', 'reference picture', 'photo', 'model sheet', 'mood board', 'underlay', 'rotoscope', 'jpg', 'png', 'screenshot', 'pureref', 'picture behind', 'fade'],
  },
  {
    id: 'reference-video',
    media: 'reference-video.png',
    title: 'Open a video to trace over',
    section: 'Animating',
    summary: 'Pick a video, choose the stretch you want and how many pictures a second, and its frames land as a reference layer or as pixel frames, ready to draw over.',
    keywords: ['video', 'rotoscope', 'rotoscoping', 'footage', 'mp4', 'webm', 'mov', 'frames from video', 'screen recording', 'reference', 'import video', 'film'],
  },
]);
