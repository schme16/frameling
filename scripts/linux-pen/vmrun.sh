#!/bin/bash
# usage: vmrun.sh scenario out.jsonl [main.cjs]
cd /mnt/share
SCEN=$1; OUT=$2; MAIN=${3:-probe-main.cjs}
sudo pkill Xorg; sudo pkill -f tablet.py; sleep 0.5
sudo rm -f /tmp/Xorg.log
sudo sh -c 'Xorg :0 -config /mnt/share/dummy.conf -noreset -ac -novtswitch -sharevts -nolisten tcp -logfile /tmp/Xorg.0.log >/dev/null 2>&1 &'
for i in $(seq 40); do DISPLAY=:0 xset q >/dev/null 2>&1 && break; sleep 0.25; done
rm -f /tmp/fifo; mkfifo /tmp/fifo
sudo sh -c 'python3 -I /mnt/share/tablet.py < /tmp/fifo > /tmp/tablet.out 2>&1 &'
exec 3<>/tmp/fifo
sleep 2
cat /tmp/tablet.out
DISPLAY=:0 xinput list
rm -f $OUT
PROBE_OUT=$OUT DISPLAY=:0 /mnt/share/electron/electron --no-sandbox --disable-gpu --in-process-gpu --disable-gpu-sandbox $MAIN > /tmp/probe.log 2>&1 &
EP=$!
sleep 6
DISPLAY=:0 xinput test-xi2 --root > /mnt/share/xi.log 2>&1 &
XI=$!
sleep 1
while read -r line; do echo "$line" >&3; done < $SCEN
N=$(grep -vc "^ *sleep\|^ *$" $SCEN); for i in $(seq 200); do [ $(grep -c "^ok" /tmp/tablet.out) -ge $N ] && break; sleep 0.1; done
sleep 0.5
DISPLAY=:0 xinput list
DISPLAY=:0 xinput list-props 'Huion Tablet_H640P Pen Pen (0)' > /mnt/share/props.txt 2>&1
kill $XI
echo quit >&3
sleep 1; kill $EP 2>/dev/null; sleep 1; sudo pkill Xorg
