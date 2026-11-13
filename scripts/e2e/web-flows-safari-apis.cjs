// Safari's missing pieces (no audio encoder, no OGG, an old browser), stood in for in Chromium after the page has loaded.
// Kept apart from web-flows.cjs. Real WebKit was used to look at the same paths (see the safari-apis board notes).
const { flow, check, sleep, makeWindow } = require('./web.cjs');

const WAV = `(() => { const n = 24000, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer); const s = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0))); s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 20) * 12000, true); return [...b]; })()`;

flow('safari-apis', async () => {
  const w = makeWindow('persist:safari-apis');
  await w.load('plain');
  await w.js(`__frameling.overlays.closeSheet()`);
  await w.js(`__framelingExport.load('bouncing-ball')`);
  await w.js(`__framelingExport.setChoice('audio.longSound', 'keep')`);

  // The check that says "needs a newer browser" ships as a plain script: this browser passes, an empty one does not.
  check('the browser check lets this browser through', (await w.js(`typeof framelingMissing === 'function' && framelingMissing(window).length`)) === 0);
  check('and names what an old Safari lacks', JSON.stringify(await w.js(`framelingMissing({})`)) === '["OffscreenCanvas","createImageBitmap","roundRect"]');

  // Safari before 26: no audio encoder, so no AAC and no Opus.
  await w.js(`delete window.AudioEncoder; delete window.AudioDecoder; 0`);
  check('(stand-in) no AudioEncoder', (await w.js(`typeof AudioEncoder`)) === 'undefined');
  check('a WAV still goes on the timeline', await w.js(`__framelingAudio.addSound(${WAV}, 'tone.wav', 'audio/wav')`));
  await sleep(500);

  const exportAs = async (format) => {
    await w.js(`__shim.downloads.length = 0; window.__exp = null; (() => { const d = __framelingExport.defaults(); __framelingExport.run({ ...d, format: '${format}', range: 'all' }).then((r) => (window.__exp = r)); })(); 0`);
    const r = await w.waitFor(`window.__exp`, 30000);
    await sleep(500);
    return { r, out: await w.files.collect(), toast: await w.js(`[...document.querySelectorAll('.ui-toast')].map((x) => x.innerText.replace(/\\n/g, ' ')).join(' || ')`) };
  };

  const mp4 = await exportAs('mp4');
  check('MP4 with sound is made without asking a question, as a MOV that carries the sound', mp4.r?.outcome === 'done' && mp4.out.length === 1 && mp4.out[0].bytes.subarray(4, 8).toString('latin1') === 'ftyp' && /\.mov$/.test(mp4.out[0].name), [mp4.r?.error, mp4.out.map((o) => o.name)]);
  check('the sound is carried uncompressed (sowt), so QuickTime and Safari play it', mp4.out[0] && mp4.out[0].bytes.toString('latin1').includes('sowt'), mp4.out[0] && ['sowt', 'mp4a', 'Opus', 'soun'].filter((x) => mp4.out[0].bytes.toString('latin1').includes(x)));
  check('and it says so, in plain words', /can't compress sound.*MOV file.*file is bigger/.test(mp4.toast) && !/[–—]/.test(mp4.toast), mp4.toast);

  const webm = await exportAs('webm');
  check('WebM is made, without sound, and says so and points at MP4', webm.r?.outcome === 'done' && /An MP4 keeps its sound/.test(webm.toast), [webm.r?.error, webm.toast]);

  // Older Safari: OGG does not open. Stand-ins for the audio element and Web Audio refusing it.
  await w.js(`(() => { const c = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /ogg/i.test(t) ? '' : c.call(this, t); }; const d = BaseAudioContext.prototype.decodeAudioData; BaseAudioContext.prototype.decodeAudioData = function () { return Promise.reject(new Error('no ogg')); }; })(); 0`);
  const added = await w.js(`__framelingAudio.addSound([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 'song.ogg', 'audio/ogg')`);
  await sleep(500);
  const toast = await w.js(`[...document.querySelectorAll('.ui-toast')].map((x) => x.innerText.replace(/\\n/g, ' ')).join(' || ')`);
  check('an OGG that cannot be opened gets its own kind message (not "damaged")', added === false && /can't open OGG sound files \(Safari can't, in older versions\).*MP3, M4A or WAV/.test(toast) && !/damaged/.test(toast), toast);
  await w.shot('safari-apis-ogg');
});
