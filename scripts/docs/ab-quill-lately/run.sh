#!/usr/bin/env bash
# What you come back to after a short gap and after a long one, in both themes, captioned side by side into
# brand/ab/quill-house-while-away/. Run from the repo root, after `npm run build`:
#   xvfb-run -a -s "-screen 0 1600x1000x24" bash scripts/docs/ab-quill-lately/run.sh
# The gap is only used to stage the return (the debug hook), exactly as start-up does. Nothing shown says how long it was.
set -euo pipefail
OUT=brand/ab/quill-house-while-away
TMP=$(mktemp -d)
mkdir -p "$OUT"
steps() { # gap seed
cat <<JSON
[
  {"eval": "__frameling.template('bouncing-ball')"},
  {"wait": 800},
  {"eval": "__frameling.showPanel('quill-pet')"},
  {"wait": 900},
  {"eval": "(() => { const el = [...document.querySelectorAll('.qp-tabs .ui-seg')].find((e) => e.textContent.includes('His things')); el.click(); return true; })()"},
  {"wait": 500},
  {"eval": "(() => { const s = __frameling.store(); for (const f of [0, 6, 12]) { s.setUi({ frame: f }); document.querySelector('.qp-give').click(); } for (const c of ['#ff6f91', '#4cc9a0', '#5b8def']) __framelingQuillPet.tell({ kind: 'noticed', colour: c }); return true; })()"},
  {"wait": 2200},
  {"eval": "__framelingQuillPet.comeBack($1, $2)"},
  {"wait": 4600},
  {"eval": "(() => { const el = [...document.querySelectorAll('.qp-tabs .ui-seg')].find((e) => e.textContent.includes('Room')); el.click(); return true; })()"},
  {"wait": 900},
  {"eval": "document.querySelector('.qp-panel').scrollIntoView({ block: 'start' })"},
  {"shot": "kick", "crop": [0, 0, 8, 8]},
  {"wait": 600},
  {"eval": "(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); document.querySelector('.qp-panel').setAttribute('data-shot', '1'); return true; })()"},
  {"shot": "room", "el": "[data-shot]", "pad": 2}
]
JSON
}
for theme in dark light; do
  for v in "short 2 2" "long 400 11"; do
    set -- $v
    steps "$2" "$3" > "$TMP/$1.json"
    npx electron scripts/docs/record.cjs "$TMP/$1-$theme" "$TMP/$1.json" --theme "$theme" --prefs '{"showWelcome":false,"reduceMotion":true}'
    cp "$TMP/$1-$theme/room.png" "$TMP/$1-$theme.png"
  done
  convert "$TMP/short-$theme.png" -background none -gravity north -splice 0x34 -extent 330x -pointsize 15 -fill "$([ $theme = dark ] && echo white || echo black)" -annotate +0+6 "A day or two out: one thing to see" "$TMP/a-$theme.png"
  convert "$TMP/long-$theme.png" -background none -gravity north -splice 0x34 -extent 330x -pointsize 15 -fill "$([ $theme = dark ] && echo white || echo black)" -annotate +0+6 "A long time out: more to see" "$TMP/b-$theme.png"
  cp "$TMP/short-$theme.png" "$OUT/short-$theme.png"
  cp "$TMP/long-$theme.png" "$OUT/long-$theme.png"
  bg=$([ $theme = dark ] && echo '#1c1a26' || echo '#fff8ec')
  convert "$TMP/a-$theme.png" "$TMP/b-$theme.png" -background "$bg" -gravity north +append -bordercolor "$bg" -border 16 "$OUT/while-away-$theme.png"
done
echo "$OUT"
