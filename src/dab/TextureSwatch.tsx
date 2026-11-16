// A texture picture drawn small, as the greys it is made of, so you can see what the brush catches on or paints through.
import { useEffect, useRef } from 'react';
import { decodeBytes, type TexturePicture } from './texturePicture';

export function TextureSwatch({ picture, invert, label }: { picture: TexturePicture; invert?: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const n = picture.side;
    c.width = n;
    c.height = n;
    const bytes = decodeBytes(picture.data, n * n);
    const g = c.getContext('2d');
    if (!g || !bytes) return;
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = invert ? 255 - bytes[i] : bytes[i];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [picture, invert]);
  return <canvas ref={ref} className="dab-texpic" role="img" aria-label={label} />;
}
