"""Reference mouth timing for a REAL recording, by warping a synthesised reading of the same words onto it.

  python3 scripts/lipsync/real_refs.py <out_dir> <recording.wav> "What was said" [<recording2.wav> "Words" ...]

Synthesises the transcript with libespeak-ng (phoneme timing known), measures log-mel features of both, finds the
best warping path between them (dynamic time warping, which knows nothing about Frameling's classifier or aligner), and
moves each phoneme's start and end across it. Writes <out_dir>/real-N.wav (mono 16 bit) and real-N.json in the same
format as make_refs.py with split "real", so `eval.mjs <out_dir>` scores them. The timing is good to a few frames, not exact.
Keep the recordings out of the repository.
"""
import json, os, sys, tempfile, wave
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_refs  # noqa: E402


def read_wav(path):
    with wave.open(path) as w:
        n, ch, width, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    assert width == 2, 'expects 16 bit'
    x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    return (x.reshape(-1, ch).mean(axis=1) if ch > 1 else x), rate


def resample(x, a, b):
    if a == b: return x
    t = np.arange(int(len(x) * b / a)) * a / b
    return np.interp(t, np.arange(len(x)), x).astype(np.float32)


def mel_features(x, rate=16000, win=400, hop=160, bands=26):
    x = np.append(x[0], x[1:] - 0.97 * x[:-1])
    n = 1 + max(0, (len(x) - win) // hop)
    frames = np.stack([x[i * hop:i * hop + win] * np.hanning(win) for i in range(n)])
    spec = np.abs(np.fft.rfft(frames, 512)) ** 2
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    imel = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(60), mel(7600), bands + 2))
    bins = np.floor((512 + 1) * pts / rate).astype(int)
    fb = np.zeros((bands, 257))
    for b in range(bands):
        l, c, r = bins[b], bins[b + 1], bins[b + 2]
        for k in range(l, c): fb[b, k] = (k - l) / max(1, c - l)
        for k in range(c, r): fb[b, k] = (r - k) / max(1, r - c)
    f = np.log(spec @ fb.T + 1e-8)
    return f - f.mean(axis=0)  # per-recording mean: removes the speaker and microphone's tilt


def speech_span(x, rate, floor_db=-40):
    """Seconds where the recording is louder than `floor_db` below its peak (10 ms steps): its first and last speech."""
    h = rate // 100
    n = len(x) // h
    level = 10 * np.log10(np.array([np.mean(x[i * h:(i + 1) * h] ** 2) for i in range(n)]) + 1e-12)
    loud = np.nonzero(level > level.max() + floor_db)[0]
    return loud[0] / 100, (loud[-1] + 1) / 100


def dtw(a, b):
    n, m = len(a), len(b)
    d = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(-1))
    cost = np.full((n + 1, m + 1), np.inf); cost[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost[i, j] = d[i - 1, j - 1] + min(cost[i - 1, j - 1], cost[i - 1, j] + 0.5, cost[i, j - 1] + 0.5)
    i, j, path = n, m, []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        step = np.argmin([cost[i - 1, j - 1], cost[i - 1, j] + 0.5, cost[i, j - 1] + 0.5])
        i, j = (i - 1, j - 1) if step == 0 else (i - 1, j) if step == 1 else (i, j - 1)
    return path[::-1]


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    jobs = list(zip(sys.argv[2::2], sys.argv[3::2]))
    for k, (wav, text) in enumerate(jobs):
        make_refs.ALL = [(text, 'real')]
        with tempfile.TemporaryDirectory() as tmp:
            make_refs.espeak_set(tmp)
            syn = json.load(open(os.path.join(tmp, 'esp0-000.json')))
            sx, sr = read_wav(os.path.join(tmp, 'esp0-000.wav'))
        rx, rr = read_wav(wav)
        # Only the speech is warped; the silence around it stays silence.
        (r0, r1), (s0, s1) = speech_span(rx, rr), speech_span(sx, sr)
        a = mel_features(resample(rx[int(r0 * rr):int(r1 * rr)], rr, 16000))
        b = mel_features(resample(sx[int(s0 * sr):int(s1 * sr)], sr, 16000))
        path = dtw(a, b)
        # For each synthetic frame, the real frame it lands on (the middle of the real frames that map to it).
        land = {}
        for i, j in path: land.setdefault(j, []).append(i)
        mapped = np.array([np.mean(land[j]) if j in land else np.nan for j in range(len(b))])
        idx = np.arange(len(b))
        mapped = np.interp(idx, idx[~np.isnan(mapped)], mapped[~np.isnan(mapped)])
        warp = lambda t: r0 + float(np.interp((min(max(t, s0), s1) - s0) * 100, idx, mapped)) / 100  # seconds in the synthetic reading to seconds in the recording
        total = len(rx) / rr
        phonemes = []
        for p in syn['phonemes']:
            s, e = warp(p['start']), warp(p['end'])
            if e > s: phonemes.append({'ph': p['ph'], 'mouth': p['mouth'], 'start': round(s, 4), 'end': round(min(e, total), 4)})
        # The warped timeline ends where the synthetic reading ends; the rest of the recording is rest.
        ends = phonemes[-1]['end'] if phonemes else 0
        make_refs.write_wav(os.path.join(out, 'real-%d.wav' % k), [int(v * 32767) for v in np.clip(rx, -1, 1)], rr)
        json.dump({'text': text, 'engine': 'real', 'voice': 'real', 'rate': rr, 'split': 'real', 'phonemes': phonemes}, open(os.path.join(out, 'real-%d.json' % k), 'w'))
        print(wav, 'speech from %.2f to %.2f of %.2f s' % (phonemes[0]['start'], ends, total))
