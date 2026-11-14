// The choices a Lottie export offers, and how remembered ones are checked. Kept apart from the options panel so
// the format's registration stays light.
import type { ExportSettings } from './types';

/** How a Lottie file stores pictures made from effects (see PICTURE_LOOKS in lottie.ts). */
export const PICTURE_CHOICES: { id: NonNullable<ExportSettings['lottiePictures']>; label: string; note: string }[] = [
  { id: 'balanced', label: 'Balanced', note: 'Sharp on high density screens and about half the size of Sharpest. Saved as WebP, which every current browser and phone plays.' },
  { id: 'sharp', label: 'Sharpest', note: 'Every pixel kept, saved as PNG. The biggest file, and it plays in the oldest players too.' },
  { id: 'small', label: 'Smallest', note: 'Half the detail, so the smallest file. Edges look a little soft on high density screens.' },
];

/** The two kinds of Lottie file. */
export const FILE_CHOICES: { id: NonNullable<ExportSettings['lottieFile']>; label: string; note: string }[] = [
  { id: 'json', label: 'Lottie (.json)', note: 'One plain file that every Lottie player opens.' },
  { id: 'dotlottie', label: 'dotLottie (.lottie)', note: 'One smaller file that holds the animation and its pictures. Plays in the dotLottie players (LottieFiles, web, iOS, Android), which not every older Lottie player is.' },
];

/** The two layouts of a dotLottie file. */
export const LAYOUT_CHOICES: { id: 1 | 2; label: string; note: string }[] = [
  { id: 2, label: 'Current', note: 'The layout the dotLottie players and LottieFiles use today. It keeps the loop setting in a tiny play script that players start with, so the repeat is kept (the web player needs to be told to run it).' },
  { id: 1, label: 'Older', note: 'The first layout, for older dotLottie players. It also carries the loop setting.' },
];

/** Drops remembered Lottie settings that no longer mean anything. */
export function repairLottieSettings(s: ExportSettings): void {
  if (s.lottiePictures && !PICTURE_CHOICES.some((c) => c.id === s.lottiePictures)) delete s.lottiePictures;
  if (s.lottieFile && !FILE_CHOICES.some((c) => c.id === s.lottieFile)) delete s.lottieFile;
  if (s.lottieSoft && s.lottieSoft !== 'pictures') delete s.lottieSoft;
  if (s.dotLottieVersion !== 1) delete s.dotLottieVersion;
}
