#!/bin/bash
# Starts an Ubuntu 24.04 virtual machine to run the pretend tablet in. The host cannot do it: /dev/uinput can be written by
# the desktop user, but the event node of a new uinput device is root:input with no access for them, and the desktop's own X
# server would also pick the pretend pen up. A VM has root and its own input.
#
#   scripts/linux-pen/vm-up.sh <workdir>      (needs qemu-system-x86_64 with KVM, genisoimage, ssh; about 3 GB)
#
# Then, from the same folder (the VM sees it as /mnt/share through 9p, root and all):
#   ./ssh.sh 'bash /mnt/share/vmapp.sh x11 /mnt/share/res-x11'      Quill's pen check in the built app, on X11
#   ./ssh.sh 'bash /mnt/share/vmapp.sh wayland /mnt/share/res-wl'   the same on Wayland (weston, drm backend)
#   ./ssh.sh 'bash /mnt/share/vmrun.sh scen1.txt /mnt/share/out.jsonl'   a bare page logging every pointer event, X11
#   ./ssh.sh 'bash /mnt/share/vmwl.sh scen1.txt /mnt/share/out.jsonl'    the same on Wayland
#   python3 show.py share/out.jsonl ; python3 share/report-summary.py share/res-x11
# See docs/testing.md, "A pretend tablet".
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
W=${1:?work folder}
REPO=$(cd "$HERE/../.." && pwd)
mkdir -p "$W/share/app" && cd "$W"
[ -f noble.img ] || { curl -L -o noble.img https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img; qemu-img resize noble.img 14G; }
[ -f key ] || ssh-keygen -t ed25519 -N "" -f key -q
printf '#cloud-config\nusers:\n  - name: tester\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    shell: /bin/bash\n    ssh_authorized_keys:\n      - %s\nssh_pwauth: false\n' "$(cat key.pub)" > user-data
printf 'instance-id: pen-x11\nlocal-hostname: penvm\n' > meta-data
genisoimage -quiet -output seed.iso -volid cidata -joliet -rock user-data meta-data
cat > ssh.sh <<EOS
#!/bin/bash
exec ssh -i "$W/key" -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -p 2231 tester@127.0.0.1 "\$@"
EOS
chmod +x ssh.sh
cp "$HERE"/*.py "$HERE"/*.cjs "$HERE"/*.sh "$HERE"/*.txt "$HERE"/dummy.conf share/
cp "$REPO/package.json" share/app/
rm -rf share/app/dist && cp -r "$REPO/dist" share/app/dist
[ -d share/electron ] || { mkdir -p share/electron; cp -a "$REPO/node_modules/electron/dist/." share/electron/; }
chmod -R a+rwX share
nohup qemu-system-x86_64 -enable-kvm -cpu host -smp 4 -m 6G -display none -vga none -device virtio-gpu-pci \
  -drive file=noble.img,if=virtio -drive file=seed.iso,if=virtio,format=raw -nic user,hostfwd=tcp:127.0.0.1:2231-:22 \
  -virtfs local,path="$W/share",mount_tag=share,security_model=none > qemu.log 2>&1 &
for i in $(seq 60); do ./ssh.sh true 2>/dev/null && break; sleep 3; done
./ssh.sh 'sudo mkdir -p /mnt/share /run/wl && sudo chmod 700 /run/wl && sudo mount -t 9p -o trans=virtio,version=9p2000.L share /mnt/share'
# Once, the first time (a few minutes):
if ! ./ssh.sh 'command -v weston >/dev/null'; then
  ./ssh.sh 'sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xserver-xorg-core xserver-xorg-video-dummy xserver-xorg-input-libinput x11-utils x11-xserver-utils xinput python3-evdev libinput-tools weston libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxtst6 libdrm2 libxkbcommon0 libatk-bridge2.0-0t64 libcups2t64'
fi
echo "VM is up. Use: cd $W && ./ssh.sh 'bash /mnt/share/vmapp.sh x11 /mnt/share/res-x11'"
