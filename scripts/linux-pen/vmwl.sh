#!/bin/bash
# usage: vmwl.sh scenario out.jsonl [main.cjs]
cd /mnt/share
SCEN=$1; OUT=$2; MAIN=${3:-probe-main.cjs}
sudo pkill -f tablet.py; sudo pkill weston; sudo pkill -f electron; sleep 1
sudo sh -c 'XDG_RUNTIME_DIR=/run/wl nohup weston --backend=drm --shell=kiosk --socket=wl-test --idle-time=0 > /tmp/weston.log 2>&1 &'
sleep 4
rm -f /tmp/fifo; mkfifo /tmp/fifo
sudo sh -c 'python3 -I /mnt/share/tablet.py < /tmp/fifo > /tmp/tablet.out 2>&1 &'
exec 3<>/tmp/fifo
sleep 2
rm -f $OUT
sudo sh -c "XDG_RUNTIME_DIR=/run/wl WAYLAND_DISPLAY=wl-test FS=1 PROBE_OUT=$OUT /mnt/share/electron/electron --no-sandbox --disable-gpu --in-process-gpu --disable-gpu-sandbox --ozone-platform=wayland $MAIN > /tmp/probe.log 2>&1 &"
sleep 8
N=$(grep -vc "^ *sleep\|^ *$" $SCEN)
while read -r line; do echo "$line" >&3; done < $SCEN
for i in $(seq 200); do [ $(grep -c "^ok" /tmp/tablet.out) -ge $N ] && break; sleep 0.1; done
sleep 0.5
echo quit >&3; sleep 1; sudo pkill -f electron; sleep 1; sudo pkill weston
