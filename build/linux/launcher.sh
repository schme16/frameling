#!/usr/bin/env bash
# Frameling's Linux launcher. build/after-pack.cjs puts this where the app's program used to be (the program itself
# becomes frameling.bin next to it), so every start of the AppImage goes through here.
#
# What it does:
#  1. The AppImage's own start script (AppRun) tries to make a "user namespace", and when that fails it quietly adds
#     --no-sandbox, which switches off the browser engine's safety layer. Ubuntu 24.04 and the systems built on it block
#     user namespaces for apps without an AppArmor profile (kernel.apparmor_restrict_unprivileged_userns=1), so that is
#     what happens there. Systems that don't have that restriction never get the flag. Here the flag is taken off again
#     and Frameling is started with the safety layer ON. If that works (an AppArmor profile or the system setting allows
#     it), nothing else happens.
#  2. If it can't start that way, Frameling asks, in plain words, and shows the one-time fix. It starts without the safety
#     layer only when the person says so (or has said so before: FRAMELING_NO_SANDBOX=1 or the remembered answer).
#  3. FRAMELING_OZONE=x11 (or wayland, auto) picks the window system by hand. By default Electron uses Wayland on a
#     Wayland session and X11 otherwise. X11 on a Wayland desktop means XWayland, which is the fallback if a pen is
#     not getting through natively.
#  4. --show-linux-fix prints the fix and exits.
set -u

HERE="$(dirname "$(readlink -f "$0")")"
REAL="$HERE/frameling.bin"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/Frameling/no-sandbox-ok"

FIX_TEXT='Frameling runs its pages inside a safety layer (the browser engine'"'"'s sandbox). Ubuntu 24.04 and newer
need to be told that is allowed. Pick ONE of these, paste it into a terminal, then start Frameling again.

A. Only for Frameling (best):

sudo tee /etc/apparmor.d/frameling >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>
profile frameling /tmp/{.mount_*,appimage_extracted_*}/frameling.bin flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/frameling

B. For every app on this computer:

echo "kernel.apparmor_restrict_unprivileged_userns = 0" | sudo tee /etc/sysctl.d/60-allow-userns.conf
sudo sysctl --system'

say() { printf 'Frameling: %s\n' "$*" >&2; }

# One harmless line from the engine's certificate store ("After loading Root Certs, loaded==false: NSS error code: -8018")
# is the first thing a terminal showed and made a working app look broken. It is native code writing straight to stderr,
# so it is dropped here, by exact pattern. Every other line, errors included, passes through. Keep this the same as
# NSS_NOISE_PATTERN in src/main/stderrNoise.ts (a test checks they match). Without grep nothing is filtered.
NSS_NOISE='ERROR:(crypto/)?nss_util\.cc:[0-9]+\] After loading Root Certs, loaded==false: NSS error code: -8018$'
quiet() { grep --line-buffered -v -E "$NSS_NOISE" || true; }
if ! command -v grep >/dev/null 2>&1; then quiet() { cat; }; fi

# Runs the real program, replacing this script. argv[0] stays "frameling", so the window class and process name match the launcher entry.
# Its errors go through quiet(); the exit code is the program's own, since the program replaces this script.
start() { exec -a frameling "$REAL" "$@" 2> >(quiet >&2); }

# --show-linux-fix: just print the fix.
for a in "$@"; do
  if [ "$a" = --show-linux-fix ]; then
    printf '%s\n' "$FIX_TEXT"
    exit 0
  fi
done

# Hardware drawing. Frameling is a drawing app, so leaving the card out of it is the worst thing to leave to chance,
# and the browser engine says no to plenty of perfectly good Linux drivers by default. --ignore-gpu-blocklist says
# yes: use the card even on a driver the engine has not been told about. That is all the default does.
#
# The culprit, found one flag at a time on a real NVIDIA card: --enable-features=Vulkan,DefaultANGLEVulkan draws
# nothing at all. The file opens, every layer is there, and the canvas stays empty. It is never added here, not even
# by FRAMELING_GPU=full, and FRAMELING_GPU=vulkan is the only way to get it, for anyone measuring it on another card.
# --enable-zero-copy and --canvas-oop-rasterization both draw correctly on that same card, and are what
# FRAMELING_GPU=full means now. They are not the default until they are proven on more than one card.
GPU_ARGS=(--ignore-gpu-blocklist)
if [ "${FRAMELING_GPU:-}" = full ]; then
  GPU_ARGS+=(--enable-zero-copy --canvas-oop-rasterization)
  say 'keeping canvas pixels on the card (FRAMELING_GPU=full).'
fi
if [ "${FRAMELING_GPU:-}" = vulkan ]; then
  GPU_ARGS+=(--enable-features=Vulkan,DefaultANGLEVulkan)
  say 'drawing through Vulkan (FRAMELING_GPU=vulkan). This drew nothing at all on the NVIDIA card it was found on.'
fi
if [ "${FRAMELING_GPU:-}" = off ] || [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/Frameling/gpu-off" ]; then
  GPU_ARGS=(--disable-gpu)
  say 'drawing in software, as you asked (FRAMELING_GPU=off).'
fi
args=("${GPU_ARGS[@]}" "$@")

# The window system, if asked for by hand.
case "${FRAMELING_OZONE:-}" in
  x11 | wayland) args=("--ozone-platform=$FRAMELING_OZONE" "${args[@]}") ;;
  auto) args=(--ozone-platform-hint=auto "${args[@]}") ;;
esac

# Is --no-sandbox among the arguments? (typed by hand, or added by AppRun)
flagged=0
kept=()
for a in "${args[@]}"; do
  if [ "$a" = --no-sandbox ]; then flagged=1; else kept+=("$a"); fi
done

# No flag: the normal start. Chromium will use its safety layer.
[ "$flagged" = 0 ] && start "${kept[@]}"

# The person asked for it, earlier or just now.
if [ "${FRAMELING_NO_SANDBOX:-}" = 1 ] || [ -f "$CONF" ]; then
  say 'starting without the safety layer, as you asked (delete '"$CONF"' or unset FRAMELING_NO_SANDBOX to be asked again).'
  start --no-sandbox "${kept[@]}"
fi

# User namespaces work, so --no-sandbox was typed by hand: that is a choice, and it stays.
if command -v unshare >/dev/null 2>&1 && unshare -Ur true 2>/dev/null; then
  start --no-sandbox "${kept[@]}"
fi

# AppRun could not make a user namespace. A profile for Frameling, if there is one, still lets the program do it
# itself, so try the safety layer first and watch the first few seconds.
log="$(mktemp "${TMPDIR:-/tmp}/frameling-launch.XXXXXX")"
# The program's errors go to the terminal and to the log through tee. Keep tee's id so the log can be read only once
# tee has written all of it (otherwise, on a busy computer, the check below can read the log before the error is in it).
exec 3> >(tee "$log" | quiet >&2)
teepid=$!
(exec -a frameling "$REAL" "${kept[@]}") 2>&3 3>&- &
pid=$!
exec 3>&-
trap 'kill -TERM "$pid" 2>/dev/null' TERM INT HUP
for _ in $(seq 1 40); do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
done
if kill -0 "$pid" 2>/dev/null; then
  # Still running after 8 seconds: it started fine, with the safety layer.
  wait "$pid"
  code=$?
  rm -f "$log"
  exit "$code"
fi
wait "$pid"
code=$?
wait "$teepid" 2>/dev/null
if ! grep -qiE 'sandbox|namespace' "$log"; then
  # Stopped for some other reason (a second Frameling asking the first to open a file, a clean close).
  rm -f "$log"
  exit "$code"
fi
rm -f "$log"

# It stopped because of the safety layer. Ask.
TITLE="Frameling can't use its safety layer"
ASK="This computer does not let Frameling switch on the browser engine's safety layer (Ubuntu 24.04 and newer block it until it is allowed).

Frameling can still run without it. It only opens its own pages and your own files, so the risk is small, but it is safer to allow it once. \"Show me the fix\" has two short commands to paste into a terminal."

choice=""
if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  while :; do
    out="$(LD_LIBRARY_PATH= zenity --question --title "$TITLE" --width 520 --text "$ASK" \
      --ok-label "Start this time" --cancel-label "Quit" \
      --extra-button "Show me the fix" --extra-button "Start, and don't ask again" 2>/dev/null)"
    rc=$?
    if [ "$out" = "Show me the fix" ]; then
      printf '%s\n' "$FIX_TEXT" | LD_LIBRARY_PATH= zenity --text-info --title "Allow Frameling's safety layer" --width 640 --height 480 2>/dev/null
      continue
    fi
    if [ "$out" = "Start, and don't ask again" ]; then choice=always
    elif [ "$rc" = 0 ]; then choice=once
    else choice=quit; fi
    break
  done
elif command -v kdialog >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  LD_LIBRARY_PATH= kdialog --title "$TITLE" --yesno "$ASK" --yes-label "Start this time" --no-label "Quit" 2>/dev/null && choice=once || choice=quit
elif [ -t 0 ] && [ -t 2 ]; then
  say "$TITLE"
  printf '%s\n\n%s\n' "$ASK" "$FIX_TEXT" >&2
  read -r -p "Start without the safety layer this time? [y/N] " yn
  case "$yn" in y | Y | yes) choice=once ;; *) choice=quit ;; esac
else
  # Nobody to ask (started from a script, no dialog tool). Say so loudly, and start so the person is not locked out.
  say "$TITLE. Starting without it. Run  frameling --show-linux-fix  to see how to allow it."
  command -v notify-send >/dev/null 2>&1 && notify-send "$TITLE" "Frameling started without it. Run Frameling from a terminal with --show-linux-fix for the fix." 2>/dev/null
  choice=once
fi

case "$choice" in
  always)
    mkdir -p "$(dirname "$CONF")" && : >"$CONF"
    start --no-sandbox "${kept[@]}"
    ;;
  once) start --no-sandbox "${kept[@]}" ;;
  *) exit 0 ;;
esac
