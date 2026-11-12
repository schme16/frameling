import json,sys
last=None
for l in open(sys.argv[1]):
    d=json.loads(l)
    if 'pt' not in d: print('   ',d['t'],'b',d['b'],'bs',d['bs']); continue
    k=(d['t'],d['pt'],d['id'],d['b'],d['bs'])
    if d['t']=='pointermove' and k==last: continue
    last=k
    print(d['t'],d['pt'],'id',d['id'],'b',d['b'],'bs',d['bs'],'p',d['p'],'w',d['w'],'h',d['h'],'t',d['tx'],d['ty'],'x',d['x'],d['y'])
