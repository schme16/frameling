import json,glob,sys
f=glob.glob(sys.argv[1]+'/saved/*.json')[0]
r=json.load(open(f))
print(r['version'], r['system']['session'], {k:r['buttons'][k] for k in ('eraserDetected','eraserBy','rawBarrelBits','barrelsSwapped','buttonsBitmasks')}, r['devices']['pointerTypes'], 'ids',r['devices']['pointerIds'], r['devices']['persistentIds'])
for st in r['steps']:
    s=st['seen'] or {}
    print(st['id'],st['status'],st.get('reason'),st['session'], {k:s.get(k) for k in ('eraser','eraserGuess','rawBitCounts','pointerIds','pointerIdChanges','persistentDeviceIds')} if s else None)
print(r['hints'])
