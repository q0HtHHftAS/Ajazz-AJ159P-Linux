# AJAZZ AJ159P Driver for Linux

[English](README.md) | [ภาษาไทย](README.th.md)

[![Release](https://img.shields.io/github/v/release/q0HtHHftAS/Ajazz-AJ159P-Linux)](https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

ตั้งค่าเมาส์เกมมิ่ง AJAZZ AJ159P / AJ159 Pro บน Linux ได้ครบ ทั้ง DPI ไฟ polling rate รีแมปปุ่ม sleep timer แบตเตอรี่ ต่อได้ทั้งตัวรับ 2.4GHz และสาย USB ไดรเวอร์ศูนย์มีแค่ Windows ตัวนี้ทำขึ้นมาแทน

รองรับ Ubuntu ลองบน 26.04 แล้ว ดิสโทรอื่นไม่รับประกันว่ารันได้

DPI 100–26000 ลองกับเครื่องจริงแล้ว สายกับไร้สายจำค่าแยกกันบนตัวเมาส์ macro ไม่มีบนโปรโตคอลนี้

<img width="1410" height="908" alt="image" src="https://github.com/user-attachments/assets/e47e255c-612d-4bea-89b6-fe7e0a3489cc" />

## ติดตั้งผ่าน Terminal ไม่ต้องเปิดเบราว์เซอร์

### 1. โหลดไฟล์ .deb เวอร์ชันล่าสุด

```bash
VER=$(curl -fsSL https://api.github.com/repos/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fSL -o /tmp/ajazz.deb "https://github.com/q0HtHHftAS/Ajazz-AJ159P-Linux/releases/download/${VER}/ajazz-aj159p-${VER#v}.deb"
```

### 2. ติดตั้ง

```bash
sudo dpkg -i /tmp/ajazz.deb || sudo apt install -f -y
```

### 3. เปิดสิทธิ์เข้าถึงเมาส์ (udev ทำครั้งเดียว)

udev คือสิทธิ์อุปกรณ์ของ Linux กฎนี้ให้แอปเปิดเมาส์ได้

```bash
sudo tee /etc/udev/rules.d/70-ajazz-aj159p.rules > /dev/null <<'EOF'
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="248a", ATTRS{idProduct}=="5c2e", MODE="0660", TAG+="uaccess"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### 4. ถอด dongle หรือสายแล้วเสียบใหม่หนึ่งครั้ง

### 5. เปิดแอปด้วยคำสั่ง

```bash
ajazz-aj159p
```

ถ้าไม่อยากใช้ sudo โหลด .AppImage จากหน้า Releases แทน chmod +x แล้วรันได้เลย บนดิสโทรอื่นถ้าเปิดไม่ติด ลง libfuse2 ก่อน

## ใช้งาน + อัพเดท

เสียบ dongle หรือสาย USB แล้วเปิดแอป ตั้งค่าได้เลย สลับโหมดได้ในแอป

พอมีเวอร์ชันใหม่ แอปจะขึ้นป้ายเตือนในแถบบน โหลดเสร็จกด Restart to install กดเลขเวอร์ชันมุมขวาบนเพื่อเช็คเองก็ได้

ถอนการติดตั้งด้วย sudo dpkg -r ajazz-aj159p ลบไฟล์ /etc/udev/rules.d/70-ajazz-aj159p.rules ทิ้งได้ถ้าต้องการ

## ใช้ไม่ได้ ลองนี่ก่อน

| อาการ | ทำอะไร |
|-------|---------|
| แอปหาเมาส์ไม่เจอ | ปลุกเมาส์ก่อน ถอดแล้วเสียบ dongle ใหม่ แล้วเช็คว่าทำขั้น udev ครบ |
| ขึ้น permission หรือ EACCES | ทำขั้น 3 ใหม่ แล้วเสียบอุปกรณ์ใหม่อีกครั้ง |
| แบตค้างที่ … | ขยับเมาส์ให้ตื่นแล้วรอสักครู่ โหมดสายขึ้น Charging แทนตัวเลข |
| ตั้งค่าแล้วอีกโหมดไม่ตาม | เรื่องปกติ สายกับไร้สายจำค่าแยกกัน กด sync ในหัวข้อ Connection Sync |

## Build เองจากซอร์ส (สำหรับนักพัฒนา)

```bash
bun install
bun run dev      # รันแบบ dev (HMR)
bun run package  # build ออก dist/ (.AppImage + .deb)
bun test         # 98 tests
```

## Protocol (ย่อ)

อ่านเขียน receiver 249a:5c2f กับสาย 248a:5c2e ผ่าน HID report 33 ไบต์บนช่อง vendor (/dev/hidraw, MI_02)

| Report | ใช้ทำอะไร |
|--------|------------|
| `00 03 00 01 25` | DPI 6 ขั้น (100–26000, step 100) + ขั้นที่ใช้งาน |
| `00 05 00 01` | ไฟแบบ off static breathing + สว่างเร็ว |
| `00 04 00 01 12` | สีไฟรายขั้น DPI ระบบสีจริงของเมาส์รุ่นนี้ |
| `00 02 00 01 01` | Polling rate 125 250 500 1000 Hz |
| `00 07 00 01 04` | Sleep timer (read-modify-write) |
| `00 09 00 01 0F` | รีแมปปุ่ม 9 slot (read-modify-write) |
| query `0x10`–`0x17` | อ่านค่ากลับทั้ง info ปุ่ม polling DPI สี ไฟ sensor |

Checksum ทุก report คือ sum(bytes[5..31]) & 0xff อยู่ไบต์สุดท้าย

## Credits

โครงแอปจาก [Attack-Shark-X11-Software-Linux](https://github.com/q0HtHHftAS/Attack-Shark-X11-Software-Linux) โปรโตคอลจาก [aj179-linux](https://github.com/johan-akn/aj179-linux) และ [ajazz-control-center](https://github.com/Aiacos/ajazz-control-center)

## License

MIT ดู LICENSE โปรเจกต์นี้ไม่เกี่ยวกับ AJAZZ ใช้เอง รับความเสี่ยงเอง
