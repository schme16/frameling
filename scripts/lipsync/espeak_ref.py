"""Reference speech with ground-truth phoneme timing, from the system's libespeak-ng (no network).
Usage: python3 espeak_ref.py <out_dir>   writes <name>.wav (mono 16 bit) and <name>.json (phonemes with start/end seconds).
"""
import ctypes, json, os, sys, wave

lib = ctypes.CDLL('libespeak-ng.so.1')

class Event(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('uid', ctypes.c_uint), ('text_position', ctypes.c_int), ('length', ctypes.c_int),
                ('audio_position', ctypes.c_int), ('sample', ctypes.c_int), ('user_data', ctypes.c_void_p),
                ('id', ctypes.c_char * 8)]

CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
lib.espeak_Initialize.restype = ctypes.c_int
lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
lib.espeak_Synth.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]

PHONEME_EVENTS = 1
rate = lib.espeak_Initialize(0x02, 0, b'/usr/lib/x86_64-linux-gnu/espeak-ng-data', PHONEME_EVENTS)  # 0x02 = synchronous
if rate <= 0:
    sys.exit('espeak init failed')

samples = []
events = []

def on_data(wav, n, ev):
    base = len(samples)
    if wav:
        samples.extend(wav[i] for i in range(n))
    i = 0
    while ev and ev[i].type != 0:
        if ev[i].type == 7:  # phoneme
            events.append((ev[i].id.decode('latin1'), ev[i].sample, ev[i].audio_position))
        i += 1
    return 0

cb = CB(on_data)
lib.espeak_SetSynthCallback(cb)

def say(text, voice='en-us', speed=150, pitch=50):
    del samples[:]
    del events[:]
    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetParameter(1, speed, 0)
    lib.espeak_SetParameter(3, pitch, 0)
    lib.espeak_Synth(text.encode(), len(text) + 1, 0, 0, 0, 1 << 12, None, None)  # espeakCHARS_UTF8 = 1, bit 12 = phoneme events
    lib.espeak_Synchronize()
    return list(samples), list(events), rate

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    s, e, r = say('Hello there, my name is Bob.')
    print(r, len(s), e[:20])
