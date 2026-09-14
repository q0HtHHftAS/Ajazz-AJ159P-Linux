# AJAZZ AJ159P Driver for Linux

[![Release](https://img.shields.io/github/v/release/q0HtHHftAS/Ajazz-AJ159P-Linux)](https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

โปรแกรมตั้งค่าเมาส์เกมมิ่ง **AJAZZ AJ159P / AJ159 Pro** บน Linux — DPI, ไฟ, polling rate, รีแมปปุ่ม, sleep timer, แบตเตอรี่ ผ่านตัวรับ 2.4GHz หรือสาย USB (ไดรเวอร์ศูนย์มีแค่ Windows อันนี้ทำขึ้นมาทดแทน)

<img width="1410" height="908" alt="image" src="https://github.com/user-attachments/assets/e47e255c-612d-4bea-89b6-fe7e0a3489cc" />

> รองรับ **Ubuntu** (ทดสอบบน Ubuntu 26.04) — ดิสโทรอื่นไม่รับประกันว่าเปิดติด/ใช้งานได้
> DPI 100–26000 (เทสกับเครื่องจริงแล้ว) โหมดสายกับไร้สายจำค่าแยกกันบนตัวเมาส์ ส่วน macro ไม่มีบนโปรโตคอลนี้

---

## ติดตั้งผ่าน Terminal (ไม่ต้องเปิดเบราว์เซอร์)

### 1. โหลดไฟล์ .deb เวอร์ชันล่าสุด

```bash
VER=$(curl -fsSL https://api.github.com/repos/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fSL -o /tmp/ajazz.deb "https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/download/${VER}/ajazz-aj159p-${VER#v}.deb"
```

### 2. ติดตั้ง

```bash
sudo dpkg -i /tmp/ajazz.deb || sudo apt install -f -y
```

### 3. เปิดสิทธิ์ให้แอปคุยกับเมาส์ (udev — ทำครั้งเดียว)

```bash
sudo tee /etc/udev/rules.d/70-ajazz-aj159p.rules > /dev/null <<'EOF'
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="248a", ATTRS{idProduct}=="5c2e", MODE="0660", TAG+="uaccess"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

เสร็จแล้ว**ถอด dongle/สายแล้วเสียบใหม่หนึ่งครั้ง** แล้วเปิดแอปได้เลย:

```bash
ajazz-aj159p
```

> ทางเลือกแบบไม่ใช้ sudo: โหลด `.AppImage` จากหน้า Releases แทน (`chmod +x` แล้วรันได้เลย) แต่ถ้าเปิดไม่ติดบนดิสโทรอื่น ลองลง `libfuse2` ก่อน

---

## ใช้งาน + อัพเดท

- เสียบ dongle 2.4GHz หรือสาย USB → เปิดแอป → ตั้งค่าได้เลย (สลับโหมดได้ในแอป)
- มีเวอร์ชันใหม่ แอปจะขึ้นป้ายเตือนในแถบบน → โหลดเสร็จกด **Restart to install** (กดเลขเวอร์ชันมุมขวาบนเช็คเองได้)
- ถอนการติดตั้ง: `sudo dpkg -r ajazz-aj159p` (+ ลบไฟล์กฎ udev ข้างบนถ้าต้องการ)

---

## แก้เบื้องต้นถ้าใช้ไม่ได้

| อาการ | ทำอะไร |
|-------|---------|
| แอปหาเมาส์ไม่เจอ | ขยับ/ปลุกเมาส์ก่อน, ถอดเสียบ dongle ใหม่, เช็คว่าทำขั้น udev ครบ |
| ขึ้น permission/EACCES | กฎ udev ยังไม่เข้า — รันขั้น 3 ใหม่แล้วเสียบอุปกรณ์ใหม่ |
| แบตขึ้น `…` ค้าง | ขยับเมาส์ให้ตื่นแล้วรอแป๊บ (โหมดสายไม่มี % แบต จะขึ้น Charging แทน) |
| ตั้งค่าแล้วอีกโหมดไม่ตาม | ปกติ — สายกับไร้สายจำค่าแยกกัน กด sync ในหัวข้อ Connection Sync |

---

## Build เองจากซอร์ส (สำหรับนักพัฒนา)

```bash
bun install
bun run dev      # รันแบบ dev (HMR)
bun run package  # build ออก dist/ (.AppImage + .deb)
bun test         # 98 tests
```

---

## Protocol (ย่อ)

คุยกับ receiver `249a:5c2f` / สาย `248a:5c2e` ผ่าน HID report 33 ไบต์บนช่อง vendor (`/dev/hidraw`, MI_02):

| Report | ใช้ทำอะไร |
|--------|------------|
| `00 03 00 01 25` | DPI 6 ขั้น (100–26000, step 100) + ขั้นที่ใช้งาน |
| `00 05 00 01` | ไฟ: off / static / breathing + สว่าง/เร็ว |
| `00 04 00 01 12` | สีไฟรายขั้น DPI — ระบบสีจริงของเมาส์รุ่นนี้ |
| `00 02 00 01 01` | Polling rate 125/250/500/1000 Hz |
| `00 07 00 01 04` | Sleep timer (read-modify-write) |
| `00 09 00 01 0F` | รีแมปปุ่ม 9 slot (read-modify-write) |
| query `0x10`–`0x17` | อ่านค่ากลับ (info, ปุ่ม, polling, DPI, สี, ไฟ, sensor) |

Checksum ทุก report: `sum(bytes[5..31]) & 0xff` ลงไบต์สุดท้าย

---

## Credits

- โครงแอปจาก [Attack-Shark-X11-Software-Linux](https://github.com/q0HtHHftAS/Attack-Shark-X11-Software-Linux)
- โปรโตคอลจาก [aj179-linux](https://github.com/johan-akn/aj179-linux) และ [ajazz-control-center](https://github.com/Aiacos/ajazz-control-center)

---

## License

MIT — ดู [LICENSE](LICENSE) ไม่เกี่ยวข้องกับ AJAZZ ใช้งานเองรับความเสี่ยงเอง
