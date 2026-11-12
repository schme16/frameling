#!/bin/bash
# usage: vmapp.sh x11|wayland outdir   (the app is in /mnt/share/app)
cd /mnt/share; sudo sysctl -q fs.protected_fifos=0
MODE=$1; OUT=$2
sudo pkill Xorg; sudo pkill weston; sudo pkill -f tablet.py; sudo pkill -f electron; sleep 1
sudo rm -rf $OUT /tmp/probe.log; mkdir -p $OUT
rm -f /tmp/fifo; mkfifo /tmp/fifo
if [ $MODE = x11 ]; then
  sudo sh -c 'Xorg :0 -config /mnt/share/dummy.conf -noreset -ac -novtswitch -sharevts -nolisten tcp -logfile /tmp/Xorg.0.log >/dev/null 2>&1 &'
  for i in $(seq 40); do DISPLAY=:0 xset q >/dev/null 2>&1 && break; sleep 0.25; done
else
  sudo sh -c 'XDG_RUNTIME_DIR=/run/wl nohup weston --backend=drm --shell=kiosk --socket=wl-test --idle-time=0 > /tmp/weston.log 2>&1 &'
  sleep 4
fi
sudo sh -c 'python3 -I /mnt/share/tablet.py < /tmp/fifo > /tmp/tablet.out 2>&1 &'
exec 3<>/tmp/fifo
sleep 2
if [ $MODE = x11 ]; then
  APP_DIR=/mnt/share/app OUT_DIR=$OUT DISPLAY=:0 XDG_SESSION_TYPE=x11 timeout 150 /mnt/share/electron/electron --no-sandbox --disable-gpu --in-process-gpu --disable-gpu-sandbox /mnt/share/appcheck.cjs > /tmp/probe.log 2>&1
else
  sudo sh -c "APP_DIR=/mnt/share/app OUT_DIR=$OUT XDG_RUNTIME_DIR=/run/wl WAYLAND_DISPLAY=wl-test XDG_SESSION_TYPE=wayland timeout 150 /mnt/share/electron/electron --no-sandbox --disable-gpu --in-process-gpu --disable-gpu-sandbox --ozone-platform=wayland /mnt/share/appcheck.cjs > /tmp/probe.log 2>&1"
fi
echo quit >&3; sleep 1
sudo pkill -f electron; sudo pkill Xorg; sudo pkill weston
cat $OUT/log.txt
