# AJAZZ AJ159P Driver for Linux

[English](README.md) | [ภาษาไทย](README.th.md)

[![Release](https://img.shields.io/github/v/release/q0HtHHftAS/Ajazz-AJ159P-Linux)](https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Configures your **AJAZZ AJ159P / AJ159 Pro** gaming mouse on Linux — DPI, lighting, polling rate, button remap, sleep timer, battery — over the 2.4GHz receiver or USB cable. The official AJAZZ driver is Windows-only; this is a community replacement.

<img width="1410" height="908" alt="image" src="https://github.com/user-attachments/assets/e47e255c-612d-4bea-89b6-fe7e0a3489cc" />

> Supports **Ubuntu** (tested on Ubuntu 26.04) — other distros are not guaranteed to run it.
> DPI 100–26000 (hardware-verified). Wired and wireless keep separate on-device profiles. Macros are not available on this protocol.

---

## Install via Terminal (no browser needed)

### 1. Download the latest .deb

```bash
VER=$(curl -fsSL https://api.github.com/repos/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fSL -o /tmp/ajazz.deb "https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/download/${VER}/ajazz-aj159p-${VER#v}.deb"
```

### 2. Install

```bash
sudo dpkg -i /tmp/ajazz.deb || sudo apt install -f -y
```

### 3. Grant the app access to the mouse (udev — one time)

```bash
sudo tee /etc/udev/rules.d/70-ajazz-aj159p.rules > /dev/null <<'EOF'
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="248a", ATTRS{idProduct}=="5c2e", MODE="0660", TAG+="uaccess"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Then **unplug and re-plug the dongle/cable once**, and launch:

```bash
ajazz-aj159p
```

> No-sudo alternative: grab the `.AppImage` from the Releases page instead (`chmod +x` and run). If it won't start on other distros, install `libfuse2` first.

---

## Use + update

- Plug in the 2.4GHz dongle or USB cable → open the app → configure (switch modes in-app)
- On a new release the app shows a header badge → press **Restart to install** once downloaded (click the version number top-right to check manually)
- Uninstall: `sudo dpkg -r ajazz-aj159p` (+ remove the udev rule above if you like)

---

## Quick troubleshooting

| Symptom | Fix |
|---------|-----|
| Mouse not detected | Wake the mouse first, re-plug the dongle, verify the udev step |
| permission/EACCES | udev rule not applied — redo step 3 and re-plug the device |
| Battery stuck at `…` | Wake the mouse and wait a moment (wired mode shows Charging instead of %) |
| Other mode didn't follow a change | Normal — wired/wireless profiles are separate, sync via Connection Sync |

---

## Build from source (developers)

```bash
bun install
bun run dev      # dev mode (HMR)
bun run package  # build dist/ (.AppImage + .deb)
bun test         # 98 tests
```

---

## Protocol (summary)

Talks to the receiver `249a:5c2f` / cable `248a:5c2e` via 33-byte HID reports on the vendor interface (`/dev/hidraw`, MI_02):

| Report | Purpose |
|--------|---------|
| `00 03 00 01 25` | 6-stage DPI (100–26000, step 100) + active stage |
| `00 05 00 01` | Lighting: off / static / breathing + brightness/speed |
| `00 04 00 01 12` | Per-stage indicator colours — the mouse's real colour system |
| `00 02 00 01 01` | Polling rate 125/250/500/1000 Hz |
| `00 07 00 01 04` | Sleep timer (read-modify-write) |
| `00 09 00 01 0F` | Button mapping, 9 slots (read-modify-write) |
| queries `0x10`–`0x17` | Readback (info, buttons, polling, DPI, colours, lighting, sensor) |

Checksum for all reports: `sum(bytes[5..31]) & 0xff` in the last byte.

---

## Credits

- App scaffold from [Attack-Shark-X11-Software-Linux](https://github.com/q0HtHHftAS/Attack-Shark-X11-Software-Linux)
- Protocol from [aj179-linux](https://github.com/johan-akn/aj179-linux) and [ajazz-control-center](https://github.com/Aiacos/ajazz-control-center)

---

## License

MIT — see [LICENSE](LICENSE). Not affiliated with AJAZZ. Use at your own risk.
