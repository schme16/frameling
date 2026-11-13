#!/usr/bin/python3 -I
"""A pretend Huion-style pen tablet on /dev/uinput. Prints the event node, then reads commands on stdin:
   prox pen|rubber|off | move x y | p pressure(0-8191) | touch 0|1 | s1 0|1 | s2 0|1 | tilt x y | sleep sec | sync
"""
import sys, time
from evdev import UInput, AbsInfo, ecodes as e
cap = {
  e.EV_KEY: [e.BTN_TOOL_PEN, e.BTN_TOOL_RUBBER, e.BTN_TOUCH, e.BTN_STYLUS, e.BTN_STYLUS2, e.BTN_TRIGGER],
  e.EV_ABS: [(e.ABS_X, AbsInfo(0, 0, 32767, 0, 0, 200)), (e.ABS_Y, AbsInfo(0, 0, 20479, 0, 0, 200)),
             (e.ABS_PRESSURE, AbsInfo(0, 0, 8191, 0, 0, 0)), (e.ABS_TILT_X, AbsInfo(0, -60, 60, 0, 0, 0)), (e.ABS_TILT_Y, AbsInfo(0, -60, 60, 0, 0, 0))],
}
ui = UInput(cap, name='Huion Tablet_H640P Pen', vendor=0x256c, product=0x006d, version=0x111, bustype=e.BUS_USB, input_props=[e.INPUT_PROP_POINTER])
import glob,os
time.sleep(0.5)
path=None
for d in glob.glob('/sys/class/input/event*'):
    try:
        if open(d+'/device/name').read().strip()=='Huion Tablet_H640P Pen': path='/dev/input/'+os.path.basename(d)
    except Exception: pass
print(path, flush=True)
pos = [16000, 10000]
tool = None
import threading
lock = threading.Lock()
def jitter():
    # A real tablet reports about 200 times a second while the pen is near, even when it is still.
    j = 1
    while True:
        time.sleep(0.008)
        with lock:
            if tool is not None:
                ui.write(e.EV_ABS, e.ABS_X, pos[0] + j); ui.syn(); j = -j
threading.Thread(target=jitter, daemon=True).start()
for line in sys.stdin:
    a = line.split()
    if not a: continue
    c = a[0]
    if c != 'sleep': lock.acquire()
    if c == 'prox':
        if tool is not None: ui.write(e.EV_KEY, tool, 0)
        tool = {'pen': e.BTN_TOOL_PEN, 'rubber': e.BTN_TOOL_RUBBER, 'off': None}[a[1]]
        if tool is not None:
            ui.write(e.EV_ABS, e.ABS_X, pos[0]); ui.write(e.EV_ABS, e.ABS_Y, pos[1])
            ui.write(e.EV_KEY, tool, 1)
    elif c == 'move':
        pos = [int(a[1]), int(a[2])]; ui.write(e.EV_ABS, e.ABS_X, pos[0]); ui.write(e.EV_ABS, e.ABS_Y, pos[1])
    elif c == 'p': ui.write(e.EV_ABS, e.ABS_PRESSURE, int(a[1]))
    elif c == 'touch': ui.write(e.EV_KEY, e.BTN_TOUCH, int(a[1]))
    elif c == 's1': ui.write(e.EV_KEY, e.BTN_STYLUS, int(a[1]))
    elif c == 's2': ui.write(e.EV_KEY, e.BTN_STYLUS2, int(a[1]))
    elif c == 'tilt': ui.write(e.EV_ABS, e.ABS_TILT_X, int(a[1])); ui.write(e.EV_ABS, e.ABS_TILT_Y, int(a[2]))
    elif c == 'sleep': time.sleep(float(a[1])); continue
    elif c == 'quit': break
    ui.syn()
    lock.release()
    print('ok', flush=True)
ui.close()
