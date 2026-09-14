# AJAZZ AJ159P Driver for Linux

[![Release](https://img.shields.io/github/v/release/q0HtHHftAS/Ajazz-AJ159P-Linux)](https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Desktop app to configure your **AJAZZ AJ159P / AJ159 Pro** gaming mouse on Linux (Ubuntu) — DPI, lighting, polling rate, button remap, sleep timer, battery. The official AJAZZ driver is Windows-only; this is a community reverse-engineered alternative built with Electron + Vue 3.

> Keywords: ajazz aj159p driver linux, aj159 pro linux software, 249a:5c2f hidraw, ajazz linux configurator.
>
> Connects over the 2.4GHz receiver (249a:5c2f) or USB cable (248a:5c2e) — wired and wireless keep separate on-device profiles.

<img width="1410" height="908" alt="image" src="https://github.com/user-attachments/assets/e47e255c-612d-4bea-89b6-fe7e0a3489cc" />

> DPI range 100–26000 (hardware-verified). Custom macros and key-response are not available on this receiver protocol.

---

## Install

```bash
./install.sh
```

The script installs Bun (if missing), sets up hidraw USB access (udev), builds the app, and adds it to your app menu. If the receiver is not detected afterwards, unplug it and plug it back in once.

Manual udev rule (what the script installs):

```
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
```

## Run

Launch **AJAZZ AJ159P** from your app menu, or run:

```bash
ajazz-aj159p
```

For development (HMR):

```bash
bun install
bun run dev
```

## Uninstall

```bash
./install.sh --uninstall
```

---

## ติดตั้ง (ภาษาไทย)

```bash
./install.sh
```

สคริปต์จะลง Bun, ตั้งค่า USB (udev), build แอป และเพิ่มเข้า app menu ให้อัตโนมัติ ถ้าเสียบ receiver แล้วหาไม่เจอ ให้ถอดแล้วเสียบใหม่หนึ่งครั้ง

## วิธีรัน

เปิด **AJAZZ AJ159P** จาก app menu หรือรันคำสั่ง:

```bash
ajazz-aj159p
```

## ถอนการติดตั้ง

```bash
./install.sh --uninstall
```

---

## Protocol

The 2.4 GHz receiver (`249a:5c2f` XCTECH Wireless-Receiver) is driven through
33-byte HID reports on its vendor interface (`/dev/hidraw`, MI_02) — no Windows
capture was needed thanks to prior community reverse-engineering:

| Report | Bytes | Purpose |
|--------|-------|---------|
| `00 03 00 01 25` | 33 | Six-stage DPI (100–26000, step 100) + active stage |
| `00 05 00 01` | 33 | Lighting: off / static / breathing + brightness/speed (static RGB triplet ignored by firmware) |
| `00 04 00 01 12` | 33 | Per-DPI-stage indicator colours — the visible LED and the mouse's real colour system |
| `00 02 00 01 01` | 33 | Polling rate (125/250/500/1000 Hz) |
| `00 07 00 01 04` | 33 | Sensor: sleep timer + lift-off + idle-light (read-modify-write) |
| `00 09 00 01 0F` | 33 | Button mapping, 9 slots × 3 bytes (read-modify-write) |
| `C0 …` (input) | — | Unsolicited battery pushes, percentage at byte 2 |
| `10 …` (query `0x10`) | 32 | Device info; **live battery at byte 13** (query `0x20` is unreliable) |

GET queries (write `[00, id, 00, 00, …]`, read reply): `0x10` device info,
`0x11` button table, `0x12` report rate, `0x13` DPI table, `0x14` stage
colours, `0x15` lighting state, `0x17` sensor.

Checksum for all reports: `sum(bytes[5..31]) & 0xff` in the last byte.
DPI encoding: `value / 100` as u16LE, duplicated per stage (verified by
write→readback round-trip on a live AJ159P).

---

## Credits

- Scaffolded from [Attack-Shark-X11-Software-Linux](https://github.com/q0HtHHftAS/Attack-Shark-X11-Software-Linux) (Electron + Vue app structure).
- Protocol from [aj179-linux](https://github.com/johan-akn/aj179-linux) by johan-akn (HID report reverse-engineering, golden packets) and [ajazz-control-center](https://github.com/Aiacos/ajazz-control-center) by Aiacos (AJ-series device matrix).

---

## License

MIT — see [LICENSE](LICENSE). Not affiliated with AJAZZ. Use at your own risk.
