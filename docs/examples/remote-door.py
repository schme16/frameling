#!/usr/bin/env python3
"""Drives Frameling through the remote door, from another program.

Switch the door on first (Preferences > Plugins > Remote door), then:

    FRAMELING_KEY=frd_... python3 docs/examples/remote-door.py

The key is the one beside the switch ("Copy"). The address is the one the door shows; set FRAMELING_URL
if it moved from the usual http://127.0.0.1:47231 (Frameling also writes it to remote-door.json in its data folder). Only the Python standard library is used.
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("FRAMELING_URL", "http://127.0.0.1:47231")
KEY = os.environ.get("FRAMELING_KEY", "")


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(URL + path, data=data, method=method, headers={"Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        # A refusal is an answer, not a crash: it says why in "reason" and "message".
        return e.code, json.load(e)


def show(what, status, body):
    print(f"{what}: {status} {json.dumps(body)[:160]}")


if not KEY:
    sys.exit("Set FRAMELING_KEY to the key from Preferences > Plugins > Remote door.")

# 1. Say hello, and see where things are.
show("hello", *call("GET", "/v1"))
status, state = call("GET", "/v1/state")
show("state", status, state)

# 2. A list of presses and choices is one step in Undo. This picks everything and makes a copy of it.
status, body = call("POST", "/v1/run", {"label": "Copy everything", "steps": [{"command": "select.all"}, {"command": "edit.duplicate"}]})
show("run", status, body)
if status == 409:
    # Someone is drawing, or a dialog is open. It was refused, not queued: say again when it is quiet.
    print("Frameling is busy:", body["detail"], "- try again in", body["retryInMs"], "ms")

# 3. A script runs in the same sandbox as the Scripts panel. It can read the drawing and change it.
code = """
const picked = await frameling.document.selected();
const edits = picked.shapes.map((s) => ({ op: 'setShapeStyle', drawingId: picked.drawingId, shapeId: s.id, color: '#4fd1a5' }));
await frameling.document.edit('Make green', edits);
console.log('painted ' + picked.shapes.length);
"""
show("script", *call("POST", "/v1/script", {"name": "Make green", "code": code}))

# 4. Check what happened.
show("document", *call("GET", "/v1/document"))
