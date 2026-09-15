# AJAZZ AJ159P Driver for Linux

[English](README.md) | [ภาษาไทย](README.th.md)

[![Release](https://img.shields.io/github/v/release/q0HtHHftAS/Ajazz-AJ159P-Linux)](https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This tool configures the AJAZZ AJ159P and AJ159 Pro gaming mouse on Linux. It covers DPI, lighting, polling rate, button remap, sleep timer, and battery level. It works over the 2.4GHz receiver or a USB cable. The official AJAZZ driver runs on Windows only.

Ubuntu is supported. Tests run on Ubuntu 26.04. Other distributions can fail to run the tool.

The DPI range is 100 to 26000. Tests on live hardware confirm the range. Wired and wireless connections keep separate profiles on the mouse. Macros are not available on this protocol.

## Install

Install the tool through the terminal. No browser is needed.

1. Download the latest .deb package:

```bash
VER=$(curl -fsSL https://api.github.com/repos/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fSL -o /tmp/ajazz.deb "https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/download/${VER}/ajazz-aj159p-${VER#v}.deb"
```

2. Install the package:

```bash
sudo dpkg -i /tmp/ajazz.deb || sudo apt install -f -y
```

3. Add the udev rule. A udev rule is a Linux permission entry for hardware. You perform this step one time only:

```bash
sudo tee /etc/udev/rules.d/70-ajazz-aj159p.rules > /dev/null <<'EOF'
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="248a", ATTRS{idProduct}=="5c2e", MODE="0660", TAG+="uaccess"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

4. Unplug the dongle or cable and plug it back in once.

5. Start the app:

```bash
ajazz-aj159p
```

To install without sudo, download the .AppImage file from the Releases page, mark it executable, and run it. If it does not start on other distributions, install libfuse2 first.

## Use and update

Plug in the dongle or cable and open the app. Change the configuration in the app.

When a new release exists, the app shows a badge in the header. Press Restart to install after the download completes. To check by hand, click the version number in the top-right corner.

Remove the package with the command sudo dpkg -r ajazz-aj159p. You can also delete /etc/udev/rules.d/70-ajazz-aj159p.rules.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| The app does not detect the mouse | Wake the mouse first. Re-plug the dongle. Make sure that you completed the udev step. |
| A permission or EACCES error appears | Repeat step 3 and re-plug the device. |
| The battery is stuck at … | Wake the mouse and wait. Wired mode shows Charging instead of a percent. |
| The other mode ignores a change | This is normal. Wired and wireless profiles are separate. Sync them with Connection Sync. |

## Build from source

Run these commands to build from source:

```bash
bun install
bun run dev
bun run package
bun test
```

## Protocol

The tool talks to receiver 249a:5c2f and cable 248a:5c2e. It sends 33-byte HID reports on the vendor channel (/dev/hidraw, MI_02).

| Report | Purpose |
|--------|---------|
| `00 03 00 01 25` | Six-stage DPI (100 to 26000, step 100) and the active stage |
| `00 05 00 01` | Lighting: off, static, or breathing, with brightness and speed |
| `00 04 00 01 12` | Per-stage indicator colours, the real colour system of the mouse |
| `00 02 00 01 01` | Polling rate: 125, 250, 500, or 1000 Hz |
| `00 07 00 01 04` | Sleep timer (read-modify-write) |
| `00 09 00 01 0F` | Button mapping, 9 slots (read-modify-write) |
| Queries `0x10` to `0x17` | Readback of info, buttons, polling, DPI, colours, lighting, sensor |

Each report ends with a checksum. The checksum is sum(bytes[5..31]) & 0xff.

## Credits

The app scaffold comes from [Attack-Shark-X11-Software-Linux](https://github.com/q0HtHHftAS/Attack-Shark-X11-Software-Linux). The protocol comes from [aj179-linux](https://github.com/johan-akn/aj179-linux) and [ajazz-control-center](https://github.com/Aiacos/ajazz-control-center).

## License

The license is MIT. See LICENSE. This project has no link to AJAZZ. You use it at your own risk.
