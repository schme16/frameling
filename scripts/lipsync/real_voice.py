"""Makes the scoring set for the real voice recordings (the 30 clips of the lip sync recording script).

  python3 scripts/lipsync/real_voice.py <recordings_dir> <out_dir>

<recordings_dir> is a folder of .flac/.wav files named by the sentence, with " - whispered" or " - faster" on the end
for the variants (the folder is the user's own voice and stays OUTSIDE the repository; <out_dir> should be too).
Writes <out_dir>/real-N.wav, real-N.json (mouth timing, see real_refs.py) and kinds.json (normal, faster, whispered).
Normal and faster clips get their timing by warping an espeak reading of the sentence onto them. A whispered clip has no
voicing for that to lean on, so its timing is the same speaker's normal reading of the same sentence, warped onto the
whisper (both are human, so they line up better than a synthesiser would); when there is no normal clip it is warped from
espeak like the rest. Needs ffmpeg and numpy. Nothing is uploaded or sent anywhere.
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_refs  # noqa: E402
import real_refs as rr  # noqa: E402


def sentence_and_kind(name):
    base = os.path.splitext(name)[0]
    kind = 'whispered' if base.endswith('whispered') else 'faster' if base.endswith('faster') else 'normal'
    text = re.sub(r'\s*-\s*(whispered|faster)$', '', base).strip()
    return re.sub(r'\.\.$', '.', text), kind


def warp_from_espeak(x, r, text):
    """Phonemes (start, end in the recording's seconds) for `text`, from an espeak reading warped onto the recording."""
    make_refs.ALL = [(text, 'real')]
    with tempfile.TemporaryDirectory() as tmp:
        make_refs.espeak_set(tmp)
        syn = json.load(open(os.path.join(tmp, 'esp0-000.json')))
        sx, sr = rr.read_wav(os.path.join(tmp, 'esp0-000.wav'))
    (r0, r1), (s0, s1) = rr.speech_span(x, r), rr.speech_span(sx, sr)
    warp = rr.make_warp(x, r, r0, r1, sx, sr, s0, s1)
    return [(p['ph'], p['mouth'], warp(p['start']), warp(p['end'])) for p in syn['phonemes']], len(x) / r


def warp_from_clip(x, r, other_x, other_r, other_phonemes):
    """Phonemes of another reading of the same sentence, moved onto `x`."""
    (r0, r1), (s0, s1) = rr.speech_span(x, r), rr.speech_span(other_x, other_r)
    warp = rr.make_warp(x, r, r0, r1, other_x, other_r, s0, s1)
    return [(p['ph'], p['mouth'], warp(p['start']), warp(p['end'])) for p in other_phonemes], len(x) / r


def main(src, out):
    os.makedirs(out, exist_ok=True)
    names = sorted(f for f in os.listdir(src) if f.lower().endswith(('.flac', '.wav')))
    clips = []
    for i, f in enumerate(names):
        text, kind = sentence_and_kind(f)
        wav = os.path.join(out, 'in-%d.wav' % i)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(src, f), '-ac', '1', '-sample_fmt', 's16', wav], check=True)
        x, r = rr.read_wav(wav)
        clips.append(dict(i=i, kind=kind, text=text, x=x, r=r))
    done = {}
    for c in clips:  # normal and faster first, so a whisper can lean on its normal twin
        if c['kind'] == 'whispered': continue
        ph, total = warp_from_espeak(c['x'], c['r'], c['text'])
        done[c['i']] = ph
    for c in clips:
        if c['kind'] != 'whispered': continue
        twin = next((d for d in clips if d['kind'] == 'normal' and d['text'] == c['text']), None)
        if twin:
            ph, total = warp_from_clip(c['x'], c['r'], twin['x'], twin['r'], [dict(ph=p, mouth=m, start=s, end=e) for p, m, s, e in done[twin['i']]])
        else:
            ph, total = warp_from_espeak(c['x'], c['r'], c['text'])
        done[c['i']] = ph
    kinds = []
    for c in clips:
        total = len(c['x']) / c['r']
        phonemes = [{'ph': p, 'mouth': m, 'start': round(s, 4), 'end': round(min(e, total), 4)} for p, m, s, e in done[c['i']] if e > s]
        os.remove(os.path.join(out, 'in-%d.wav' % c['i']))
        make_refs.write_wav(os.path.join(out, 'real-%d.wav' % c['i']), [int(v * 32767) for v in np.clip(c['x'], -1, 1)], c['r'])
        json.dump({'text': c['text'], 'engine': 'real', 'voice': 'real', 'rate': c['r'], 'split': 'real', 'phonemes': phonemes}, open(os.path.join(out, 'real-%d.json' % c['i']), 'w'))
        kinds.append(dict(i=c['i'], kind=c['kind'], text=c['text']))
    json.dump(kinds, open(os.path.join(out, 'kinds.json'), 'w'), indent=1)
    print('wrote', len(kinds), 'clips to', out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
