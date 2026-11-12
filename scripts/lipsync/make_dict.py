"""English pronunciations as Frameling mouths, for the lip sync typed-words dictionary (no network).

  python3 scripts/lipsync/make_dict.py <words.txt> <out.json>
  node scripts/lipsync/pack_dict.mjs <out.json>        # prunes what the spelling guide already gets right, writes the data file

Words come from a plain word list (one per line; /usr/share/dict/american-english from the wamerican package works).
Pronunciations come from the CMU Pronouncing Dictionary compiled into libflite (BSD-style licence), read through
ctypes; words it does not list get flite's own letter-to-sound guess. Each ARPAbet sound is mapped to one of
Frameling's ten mouths with the same table the evaluation references use (make_refs.py).
Writes { word: "AEOUMFLWX..." } with one letter per mouth: A E O U, M = MBP, F = FV, L, W = WQ, X = etc.
"""
import ctypes, json, re, sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from make_refs import ARPA  # noqa: E402

MAX_WORD, MAX_NAME = 11, 6
CODE = {'A': 'A', 'E': 'E', 'O': 'O', 'U': 'U', 'MBP': 'M', 'FV': 'F', 'L': 'L', 'WQ': 'W', 'etc': 'X'}

def lexicon():
    G = ctypes.RTLD_GLOBAL
    for n in ['libflite.so.1', 'libflite_cmulex.so.1', 'libflite_usenglish.so.1']: ctypes.CDLL(n, mode=G)
    fl = ctypes.CDLL('libflite.so.1', mode=G)
    lx = ctypes.CDLL('libflite_cmulex.so.1', mode=G)
    fl.flite_init()
    lx.cmu_lex_init.restype = ctypes.c_void_p
    lex = lx.cmu_lex_init()
    fl.lex_lookup.restype = ctypes.c_void_p
    fl.lex_lookup.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_void_p]
    fl.val_car.restype = ctypes.c_void_p; fl.val_car.argtypes = [ctypes.c_void_p]
    fl.val_cdr.restype = ctypes.c_void_p; fl.val_cdr.argtypes = [ctypes.c_void_p]
    fl.val_string.restype = ctypes.c_char_p; fl.val_string.argtypes = [ctypes.c_void_p]

    def look(word):
        v = fl.lex_lookup(lex, word.encode(), None, None)
        out = []
        while v:
            out.append(fl.val_string(fl.val_car(v)).decode())
            v = fl.val_cdr(v)
        return out
    return look

def mouths(phones):
    return ''.join(CODE[ARPA.get(re.sub(r'\d', '', p), 'etc')] for p in phones)

if __name__ == '__main__':
    look = lexicon()
    out = {}
    for line in open(sys.argv[1], encoding='utf8'):
        # Plain letters only: no possessives, hyphens or accents. Names and days (capitalised in the list) are kept when
        # short, folded to lower case; long rare words are left to the spelling guide, which keeps the data small.
        w = line.strip()
        if not re.fullmatch(r'[A-Za-z]+', w): continue
        if len(w) > (MAX_NAME if w[0].isupper() else MAX_WORD): continue
        w = w.lower()
        if w in out: continue
        m = mouths(look(w))
        if m: out[w] = m
    json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
    print(len(out), 'words')
