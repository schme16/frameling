"""Reference speech with ground-truth mouth timing, from this machine's own speech synthesisers (no network).

  python3 scripts/lipsync/make_refs.py <out_dir>

Writes <name>.wav (mono, 16 bit) and <name>.json for every voice and line:
  { "text", "engine", "voice", "rate", "phonemes": [ { "ph", "mouth", "start", "end" } ] }   (seconds)
It uses libespeak-ng (phoneme events) and libflite (segment relation of the diphone voices, which are cut from real
human recordings). `mouth` is one of Frameling's ten mouths: rest A E O U MBP FV L WQ etc.
"""
import ctypes, json, os, struct, sys, wave

LINES = [
    'Hello there, my name is Bob.',
    'Please put the big blue box by the baby.',
    'She sells sea shells by the sea shore.',
    'We were very happy to see you all again.',
    'I think that the weather will be fine today.',
    'Maybe we can meet for lunch on Monday.',
    'The quick brown fox jumps over the lazy dog.',
    'Can you pass me the salt and the pepper please?',
    'My brother plays the piano every evening after dinner.',
    'It was a dark and stormy night, and the wind was howling.',
    'Let me tell you a story about a little green frog.',
    'Everybody wants to be a hero, but nobody wants to wait.',
    'Open the door, put on your coat and follow me outside.',
    'I have been waiting for a very long time.',
    'Tomorrow we will build a big castle out of sand.',
    'Do you know what time the train arrives?',
    'The children laughed and played in the garden all afternoon.',
    'Wow, that was the best birthday party ever!',
    'Please be quiet, the baby is sleeping.',
    'A bad cook can burn a perfectly good pie.',
    'Mom made a mound of mashed potatoes.',
    'Thank you so much for your help with the boxes.',
    'Which way is the nearest bus stop?',
    'He said that he would never give up, not even for gold.',
    'Roll up, roll up, the show is about to begin.',
    'Bring me a big bowl of warm vegetable soup.',
    'You should always look both ways before you cross the road.',
    'The purple monkey ate seven bananas and a peach.',
    'Hey, give that back, it belongs to me!',
    'Good morning, how did you sleep last night?',
]
# Held out: never looked at while training.
HELD_OUT = [
    'Four fine fish flew over five green fields.',
    'Why would anyone move the moon?',
    'Look at that, it is a really bright light.',
    'Oh no, you broke my poor old boat!',
]

# ARPAbet (flite) to mouth.
ARPA = {}
for ph in 'aa ae ah ax er aw ay'.split(): ARPA[ph] = 'A'
for ph in 'eh ey ih iy'.split(): ARPA[ph] = 'E'
for ph in 'ao ow oy'.split(): ARPA[ph] = 'O'
for ph in 'uh uw'.split(): ARPA[ph] = 'U'
for ph in 'm b p'.split(): ARPA[ph] = 'MBP'
for ph in 'f v'.split(): ARPA[ph] = 'FV'
for ph in 'l th dh'.split(): ARPA[ph] = 'L'
ARPA['w'] = 'WQ'
for ph in 't d k g n ng s z sh zh ch jh y r hh'.split(): ARPA[ph] = 'etc'
ARPA['pau'] = 'rest'

# espeak mnemonics to mouth.
ESP_VOWEL = {
    'A': ['a', 'A', 'V', 'aI', 'aU', '@', '3', '0', 'a#', '@L', 'aa'],
    'E': ['i', 'I', 'e', 'E', 'eI', 'e@', 'I2', 'i@', 'y'],
    'O': ['O', 'o', 'oU', 'OI', 'o@', 'O@'],
    'U': ['U', 'u', 'U@', 'u@'],
}
ESP_CONS = {'MBP': 'mbp', 'FV': 'fv', 'L': 'lTD', 'WQ': 'w'}
ESP = {}
for mouth, items in ESP_VOWEL.items():
    for it in items: ESP[it] = mouth
for mouth, chars in ESP_CONS.items():
    for c in chars: ESP[c] = mouth

def esp_mouth(ph):
    p = ph.replace(':', '').replace('#', '').replace('-', '').replace('/', '')
    if p in ('_', ''): return 'rest'
    if p in ESP: return ESP[p]
    if p.startswith('_'): return 'rest'
    if p[0] in 'mbp' and len(p) == 1: return 'MBP'
    if p[0] in 'aA': return 'A'
    if p[0] in 'iIeE': return 'E'
    if p[0] in 'oO': return 'O'
    if p[0] in 'uU': return 'U'
    if p[0] in '@3V0': return 'A'
    return 'etc'

def write_wav(path, samples, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack('<%dh' % len(samples), *samples))

def save(out, name, text, engine, voice, rate, samples, phones, split):
    write_wav(os.path.join(out, name + '.wav'), samples, rate)
    with open(os.path.join(out, name + '.json'), 'w') as f:
        json.dump({'text': text, 'engine': engine, 'voice': voice, 'rate': rate, 'split': split, 'phonemes': phones}, f)

ALL = [(t, 'train') for t in LINES] + [(t, 'held') for t in HELD_OUT]

# ---- espeak ----
def espeak_set(out):
    lib = ctypes.CDLL('libespeak-ng.so.1')

    class Event(ctypes.Structure):
        _fields_ = [('type', ctypes.c_int), ('uid', ctypes.c_uint), ('text_position', ctypes.c_int), ('length', ctypes.c_int),
                    ('audio_position', ctypes.c_int), ('sample', ctypes.c_int), ('user_data', ctypes.c_void_p), ('id', ctypes.c_char * 8)]

    CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
    lib.espeak_Synth.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    rate = lib.espeak_Initialize(0x02, 0, b'/usr/lib/x86_64-linux-gnu/espeak-ng-data', 1)
    if rate <= 0: sys.exit('espeak failed to start')
    samples, events = [], []

    def on_data(wav, n, ev):
        if wav: samples.extend(wav[i] for i in range(n))
        i = 0
        while ev and ev[i].type != 0:
            if ev[i].type == 7: events.append((ev[i].id.decode('latin1'), ev[i].sample / rate))
            i += 1
        return 0

    cb = CB(on_data)
    lib.espeak_SetSynthCallback(cb)
    voices = [('en-us', 150, 50), ('en-gb+m3', 175, 35), ('en-us+f3', 130, 60)]
    seen = set()
    for vi, (voice, speed, pitch) in enumerate(voices):
        for li, (text, split) in enumerate(ALL):
            del samples[:]; del events[:]
            lib.espeak_SetVoiceByName(voice.encode())
            lib.espeak_SetParameter(1, speed, 0); lib.espeak_SetParameter(3, pitch, 0)
            lib.espeak_Synth(text.encode(), len(text) + 1, 0, 0, 0, 1 | (1 << 12), None, None)
            lib.espeak_Synchronize()
            end = len(samples) / rate
            phones = []
            for k, (ph, t) in enumerate(events):
                seen.add(ph)
                e = events[k + 1][1] if k + 1 < len(events) else end
                if e > t: phones.append({'ph': ph, 'mouth': esp_mouth(ph), 'start': round(t, 4), 'end': round(e, 4)})
            if phones and phones[0]['start'] > 0.01: phones.insert(0, {'ph': '_', 'mouth': 'rest', 'start': 0, 'end': phones[0]['start']})
            save(out, 'esp%d-%03d' % (vi, li), text, 'espeak', voice, rate, list(samples), phones, split)
    print('espeak phonemes seen:', ' '.join(sorted(seen)))

# ---- flite ----
def flite_set(out):
    G = ctypes.RTLD_GLOBAL
    for n in ['libflite.so.1', 'libflite_cmulex.so.1', 'libflite_usenglish.so.1']: ctypes.CDLL(n, mode=G)
    fl = ctypes.CDLL('libflite.so.1', mode=G)
    fl.flite_init()
    fl.flite_synth_text.restype = ctypes.c_void_p; fl.flite_synth_text.argtypes = [ctypes.c_char_p, ctypes.c_void_p]
    fl.utt_relation.restype = ctypes.c_void_p; fl.utt_relation.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    fl.utt_wave.restype = ctypes.c_void_p; fl.utt_wave.argtypes = [ctypes.c_void_p]
    fl.relation_head.restype = ctypes.c_void_p; fl.relation_head.argtypes = [ctypes.c_void_p]
    fl.item_next.restype = ctypes.c_void_p; fl.item_next.argtypes = [ctypes.c_void_p]
    fl.item_feat_string.restype = ctypes.c_char_p; fl.item_feat_string.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    fl.item_feat_float.restype = ctypes.c_float; fl.item_feat_float.argtypes = [ctypes.c_void_p, ctypes.c_char_p]

    class Wave(ctypes.Structure):
        _fields_ = [('type', ctypes.c_char_p), ('sample_rate', ctypes.c_int), ('num_samples', ctypes.c_int), ('num_channels', ctypes.c_int), ('samples', ctypes.POINTER(ctypes.c_short))]

    for vi, vname in enumerate(['slt', 'rms', 'awb', 'kal16', 'kal']):
        v = ctypes.CDLL('libflite_cmu_us_%s.so.1' % vname, mode=G)
        reg = getattr(v, 'register_cmu_us_' + vname); reg.restype = ctypes.c_void_p
        voice = reg(None)
        for li, (text, split) in enumerate(ALL):
            u = fl.flite_synth_text(text.encode(), ctypes.c_void_p(voice))
            w = ctypes.cast(fl.utt_wave(u), ctypes.POINTER(Wave)).contents
            samples = [w.samples[i] for i in range(w.num_samples)]
            phones, t0, it = [], 0.0, fl.relation_head(fl.utt_relation(u, b'Segment'))
            while it:
                name = fl.item_feat_string(it, b'name').decode()
                t1 = fl.item_feat_float(it, b'end')
                if t1 > t0: phones.append({'ph': name, 'mouth': ARPA.get(name, 'etc'), 'start': round(t0, 4), 'end': round(t1, 4)})
                t0 = t1
                it = fl.item_next(it)
            save(out, 'flt%d-%03d' % (vi, li), text, 'flite', vname, w.sample_rate, samples, phones, split)

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    espeak_set(out)
    flite_set(out)
    print('wrote', len([f for f in os.listdir(out) if f.endswith('.wav')]), 'clips to', out)
