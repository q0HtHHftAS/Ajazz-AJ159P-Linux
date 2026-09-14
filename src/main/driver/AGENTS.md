# HID DRIVER KNOWLEDGE BASE

**Parent:** ../AGENTS.md

## OVERVIEW
hidraw HID driver for the AJAZZ AJ159P / AJ159 Pro 2.4 GHz receiver (XCTECH 249a:5c2f). Plain synchronous file I/O on `/dev/hidraw` (MI_02 vendor interface) — no native USB modules. All settings are 33-byte reports (report ID `0x00` + 32 payload bytes).

## STRUCTURE
```
src/main/driver/
├── core/
│   ├── AjazzAJ159P.ts      # Main driver (EventEmitter, open/close, setDpi/setRgb/polling/keys)
│   ├── BatteryMonitor.ts   # C0-frame polling (parseBatteryFrame + BatteryMonitor)
│   └── HidrawTransport.ts  # findReceiverHidraw, openReceiverHidraw, HidrawHandle
├── protocols/
│   ├── DpiBuilder.ts       # Report 00 03 00 01 25 (6-stage DPI)
│   ├── DpiColorBuilder.ts  # Report 00 04 00 01 12 (stage-indicator colours)
│   ├── RgbBuilder.ts       # Report 00 05 00 01 (off/static/breathing)
├── errors.ts               # DriverError, ParamsError, DeviceError, InterfaceError, TimeoutError
├── types.ts                # VID/PID, DeviceModel, DpiConfig, RgbConfig, Logger
└── index.ts                # Barrel exports
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Open device, all high-level ops | core/AjazzAJ159P.ts |
| Battery level / polling | core/BatteryMonitor.ts |
| hidraw discovery + handle | core/HidrawTransport.ts |
| DPI stages | protocols/DpiBuilder.ts |
| Stage-indicator colours | protocols/DpiColorBuilder.ts (THE colour system; static-report RGB is ignored) |
| Lighting effect | protocols/RgbBuilder.ts |
| Polling rate | protocols/PollingRateBuilder.ts |
| Sleep timer | protocols/SensorBuilder.ts (fromQueryReply preserves lift-off/idle bytes) |
| Button mapping | protocols/KeyTableBuilder.ts (fromQueryReply preserves trailer slots) |
| GET queries | protocols/Queries.ts (0x10-0x17, 0x20 unreliable for battery) |
| Error handling | errors.ts |
| Type definitions | types.ts |

## CONVENTIONS
- **All builders expose `build(): Buffer` + `toString(): string`** (hex, used by golden tests)
- **Checksum**: `sum(bytes[5..31]) & 0xff` in the last byte, all three reports
- **DPI encoding**: `value / 100` as u16LE, duplicated per stage (4 bytes/stage)
- **RGB brightness/speed**: high/low nibble of byte 6; breathing uses a fixed 7-colour palette
- **Transport opens O_RDWR \| O_NONBLOCK**; reads return `null` on EAGAIN
- **Logger**: structured `{time, level, message, context}` via `Logger` interface; default logs to console with ISO timestamps

## ANTI-PATTERNS
- **Never call driver methods without `open()` first** — `checkIsOpen()` throws `DriverError`
- **Never use `C0 00` frames as battery** — command replies; only positive-link frames count
- **Never skip `close()`** — leaks the hidraw fd; `before-quit` handler in main/index.ts ensures cleanup
- **Never put `*/` inside block comments** — terminates the comment early (broke the bun parser once)

## COMMANDS
```bash
bun test __tests__/AjazzAJ159P.test.ts
bun test __tests__/BatteryMonitor.test.ts
bun test __tests__/DpiBuilder.test.ts
bun test __tests__/RgbBuilder.test.ts
bun test __tests__/PollingRateBuilder.test.ts
bun test __tests__/SensorBuilder.test.ts
bun test __tests__/KeyTableBuilder.test.ts
bun test __tests__/Queries.test.ts
```
