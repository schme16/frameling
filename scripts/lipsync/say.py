"""One line of speech from this machine's flite voice, as a 16 bit mono wav (used for the help clip).
  python3 scripts/lipsync/say.py <voice: slt rms awb kal16 kal> "<text>" <out.wav>
"""
import ctypes, struct, sys, wave
voice_name, text, out = sys.argv[1:4]
G = ctypes.RTLD_GLOBAL
for n in ['libflite.so.1', 'libflite_cmulex.so.1', 'libflite_usenglish.so.1']: ctypes.CDLL(n, mode=G)
fl = ctypes.CDLL('libflite.so.1', mode=G)
fl.flite_init()
fl.flite_synth_text.restype = ctypes.c_void_p; fl.flite_synth_text.argtypes = [ctypes.c_char_p, ctypes.c_void_p]
fl.utt_wave.restype = ctypes.c_void_p; fl.utt_wave.argtypes = [ctypes.c_void_p]
class Wave(ctypes.Structure):
    _fields_ = [('type', ctypes.c_char_p), ('sample_rate', ctypes.c_int), ('num_samples', ctypes.c_int), ('num_channels', ctypes.c_int), ('samples', ctypes.POINTER(ctypes.c_short))]
lib = ctypes.CDLL('libflite_cmu_us_%s.so.1' % voice_name, mode=G)
reg = getattr(lib, 'register_cmu_us_' + voice_name); reg.restype = ctypes.c_void_p
u = fl.flite_synth_text(text.encode(), ctypes.c_void_p(reg(None)))
w = ctypes.cast(fl.utt_wave(u), ctypes.POINTER(Wave)).contents
s = [w.samples[i] for i in range(w.num_samples)]
with wave.open(out, 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(w.sample_rate)
    f.writeframes(struct.pack('<%dh' % len(s), *s))
print(out, w.sample_rate, len(s) / w.sample_rate, 's')
