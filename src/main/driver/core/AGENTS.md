# DRIVER CORE KNOWLEDGE BASE

**Parent:** ../AGENTS.md

## OVERVIEW
Core driver classes: `AjazzAJ159P` (main driver), `BatteryMonitor` (C0-frame polling), `HidrawTransport` (device discovery + sync handle).

## STRUCTURE
```
src/main/driver/core/
├── AjazzAJ159P.ts      # Main driver class — EventEmitter, hidraw reports, battery
├── BatteryMonitor.ts   # C0-frame polling — parseBatteryFrame, emits batteryChange
└── HidrawTransport.ts  # findAjazzReceivers, openReceiverHidraw, HidrawHandle
```

## WHERE TO LOOK
| Task | File | Key Methods |
|------|------|-------------|
| Open device (hidraw MI_02) | AjazzAJ159P.ts | `open()`, `close()` |
| All device commands (DPI, RGB, polling, sleep, buttons) | AjazzAJ159P.ts | `setDpi()`, `setRgb()`, `setPollingRate()`, `setSleepMinutes()`, `setKeySlot(s)()`, `reset()` |
| Battery level / live updates | AjazzAJ159P.ts | `getBatteryLevel()`, `onBatteryChange()` |
| Battery polling internals | BatteryMonitor.ts | `parseBatteryFrame()`, `startPolling()` |
| hidraw discovery | HidrawTransport.ts | `findAjazzReceivers()` (wireless+wired MI_02 scan) |
| Device info | AjazzAJ159P.ts | `getDeviceInfo()` |

## CONVENTIONS
- **`AjazzAJ159P` extends `EventEmitter<AjazzAJ159PEvents>`** — events: `batteryChange: [number]`, `error: [Error]`
- **Connection lifecycle**: `open()` → find MI_02 node, open O_RDWR\|O_NONBLOCK, start `BatteryMonitor` → `close()` → destroy monitor, close fd
- **`checkIsOpen()`** guards every public method — throws `DriverError` if not open
- **Test injection**: constructor accepts `transport: { node, handle }` so tests use a fake `HidrawHandle`
- **BatteryMonitor**: timer-based poll loop (default 500ms), drains up to 8 frames per tick, `unref`d timer
- **Error hierarchy**: `DriverError` → `ParamsError` (paramName), `DeviceError`, `InterfaceError` (interfaceNumber), `TimeoutError`
- **Logger**: injected via constructor, defaults to structured console `{time, level, message, context}`

## ANTI-PATTERNS
- **Never call any method before `open()`** — `checkIsOpen()` throws
- **Never skip `close()`** — leaks the hidraw fd; `before-quit` in main/index.ts handles cleanup
- **Never treat `C0 00` frames as battery** — command replies; only positive-link frames count

## TESTS
- `__tests__/AjazzAJ159P.test.ts` — fake `HidrawHandle`, golden report bytes, 15 tests
- `__tests__/BatteryMonitor.test.ts` — fake timers, `parseBatteryFrame`, 7 tests
