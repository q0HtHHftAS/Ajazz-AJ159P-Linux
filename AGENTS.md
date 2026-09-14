# PROJECT KNOWLEDGE BASE

## OVERVIEW
Cross-platform Electron + Vue 3 desktop app to configure the AJAZZ AJ159P / AJ159 Pro gaming mouse (DPI, lighting, polling rate, button remap, sleep timer, battery) over its 2.4 GHz receiver. Built with Bun, TypeScript strict mode, and plain hidraw file I/O (no native USB modules). Scaffolded from the Attack Shark X11 Electron app; driver layer rewritten for the XCTECH 249a:5c2f HID protocol.

## STRUCTURE
```
.
├── src/
│   ├── main/           # Electron main process (IPC, driver, storage)
│   │   ├── driver/     # hidraw HID driver — see src/main/driver/AGENTS.md
│   │   └── storage/    # JSON file persistence — see src/main/storage/AGENTS.md
│   ├── preload/        # contextBridge IPC API (src/preload/index.ts)
│   ├── renderer/       # Vue 3 + Tailwind UI — App.vue + Dashboard.vue (DPI/lighting/profiles)
│   └── shared/         # (reserved for future shared types)
├── __tests__/          # 13 test files, bun:test — see __tests__/AGENTS.md
├── locales/            # i18n (en.json)
├── install.sh          # local build + udev hidraw rules + desktop entry
└── Config: package.json, tsconfig.json, eslint.config.ts, electron.vite.config.ts, .editorconfig, .prettierrc
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main process entry / IPC handlers | src/main/index.ts | detect/connect/DPI/RGB/colors/battery/profiles/settings |
| HID driver core | src/main/driver/core/AjazzAJ159P.ts | EventEmitter, hidraw open/write/poll |
| Protocol builders (DPI, lighting, stage colours) | src/main/driver/protocols/ | Each builder = one 33-byte report |
| Battery monitoring | src/main/driver/core/BatteryMonitor.ts | hidraw C0-frame polling |
| Persistence (settings, profiles) | src/main/storage/ | Electron app.getPath('userData') |
| Preload IPC bridge | src/preload/index.ts | contextBridge.exposeInMainWorld('api'), 23 methods |
| UI | src/renderer/src/App.vue, components/Dashboard.vue | DPI sliders, lighting, polling, sleep, button remap, profiles, device info |
| Test conventions | __tests__/ | bun:test, fake HidrawHandle, golden hex |
| Installer | install.sh | udev hidraw rule 249a:5c2f, local `bun run package` |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| AjazzAJ159P | class | src/main/driver/core/AjazzAJ159P.ts | High | Main driver, EventEmitter, hidraw reports |
| BatteryMonitor | class | src/main/driver/core/BatteryMonitor.ts | Med | C0-frame polling, emits batteryChange |
| parseBatteryFrame | function | src/main/driver/core/BatteryMonitor.ts | Med | C0 frame → percent or null |
| findReceiverHidraw | function | src/main/driver/core/HidrawTransport.ts | Med | /sys/class/hidraw scan for MI_02 |
| DpiBuilder | class | src/main/driver/protocols/DpiBuilder.ts | High | Report 00 03 00 01 25, 6-stage DPI + checksum |
| DpiColorBuilder | class | src/main/driver/protocols/DpiColorBuilder.ts | High | Report 00 04 00 01 12, stage-indicator colours (THE colour system) |
| PollingRateBuilder | class | src/main/driver/protocols/PollingRateBuilder.ts | Med | Report 00 02 00 01 01, 125-1000 Hz |
| SensorBuilder | class | src/main/driver/protocols/SensorBuilder.ts | Med | Report 00 07 00 01 04, sleep RMW |
| KeyTableBuilder | class | src/main/driver/protocols/KeyTableBuilder.ts | Med | Report 00 09 00 01 0F, 5 slots RMW |
| RgbBuilder | class | src/main/driver/protocols/RgbBuilder.ts | High | Report 00 05 00 01, off/static/breathing |
| settingsManager | module | src/main/storage/settingsManager.ts | Med | JSON persistence, type-safe load/save |
| profileManager | module | src/main/storage/profileManager.ts | Low | Profile CRUD, JSON file |
| preload api | object | src/preload/index.ts | High | 17 IPC methods exposed to renderer |

## CONVENTIONS
- **Indentation**: tabs, 4-wide (`.editorconfig`, eslint `indent: ['error', 'tab']`)
- **Quotes**: single, semicolons, trailing commas, max 120 cols (`.prettierrc`)
- **TypeScript**: strict mode, `noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `isolatedModules`, `forceConsistentCasingInFileNames`
- **Imports**: `import type` for type-only; `interface` over `type` for object shapes (`@typescript-eslint/consistent-type-definitions: ['error', 'interface']`)
- **Equality**: `===`/`!==` always (`eqeqeq: ['error', 'always']`)
- **No `any`**: `@typescript-eslint/no-explicit-any: error` (use `@ts-expect-error test` in tests for deliberate invalid calls)
- **Module resolution**: NodeNext, `.js` extension required in imports (`import ... from './file.js'`)
- **Error classes**: `DriverError` base → `ParamsError`, `DeviceError`, `InterfaceError`, `TimeoutError` (src/main/driver/errors.ts)
- **Logging**: structured `{ time, level, message, context }` via `Logger` interface (src/main/driver/types.ts)
- **Tests**: `__tests__/<Module>.test.ts`, `bun:test` imports, fake `HidrawHandle`, golden hex `builder.toString()` assertions
- **Git hooks**: pre-commit → `lint-staged` (prettier + eslint --fix); pre-push → `bun test` + `bunx tsc --noEmit`

## ANTI-PATTERNS (THIS PROJECT)
- **Never call driver methods without `open()` first** — `checkIsOpen()` throws `DriverError`
- **Never treat `C0 00` frames as battery readings** — command replies; only positive-link frames count (see parseBatteryFrame)
- **Never block the main process on hidraw reads** — transport opens O_NONBLOCK; BatteryMonitor polls on a timer
- **No `*/` sequences inside block comments** — terminates the comment early (broke the bun parser once)
- **Custom macros / key-response (debounce) are NOT implemented** — no wire encoding found on 249a:5c2f; capabilities API reports them false. Button presets cover native clicks, media keys and Ctrl+C/V; DPI-Cycle and Disable have no known encoding
- **Macros not supported on this hardware (validated 2026-09-14)**: M620 firmware silently drops macro content on both 2.4G and USB nodes (no echo, no playback). No macro code ships; capabilities API reports macros false
- **Visible LED = DPI-stage indicator**: stage colours (report 00 04) are the mouse's colour system; the RGB triplet in the static-lighting report is ignored by this firmware (verified: green stage write turned the LED green)

## UNIQUE STYLES
- **Hardware reverse-engineering style**: protocol builders encode exact HID report bytes, validated via golden hex strings (`builder.toString()`)
- **DPI encoding (OPEN QUESTION)**: currently `value / 100` as u16LE, range 100..26000 step 100. Evidence for x100: Ajazzy UI-matched captures + live 0x13 readback shape. Evidence for x50: user feel (1600 feels like 800), aj179ctl defaults equal live raws x50, nibble 6 vs Ajazzy's 5. Evdev A/B test vs X11 reference was inconclusive (ratio 0.72 — uncontrolled path/X11 DPI). To resolve: controlled same-path evdev counts vs a calibrated reference
- **Receiver**: wireless VID=0x249a PID=0x5c2f, wired VID=0x248a PID=0x5c2e (separate on-device profiles); vendor channel = MI_02 (`:1.2/`) on both
- **DeviceModel**: `'AJ159P' | 'AJ159Pro'` — protocol identical, label only
- **Battery**: hidraw C0-frame polling via BatteryMonitor; percentage at byte 2
- **IPC**: all device commands go through `src/main/index.ts` handlers → driver methods; preload exposes 25 methods

## COMMANDS
```bash
bun install              # deps (no native modules)
bun run dev              # electron-vite dev (HMR)
bun run build            # electron-vite build (main + preload + renderer)
bun run package          # build + electron-builder → dist/
bun run lint             # eslint . (0 errors required; empty-fn test warnings OK)
bun run format:fix       # prettier --write
bun run typecheck        # tsc --noEmit
bun test                 # 89 tests, bun:test
./install.sh             # udev rules + build + desktop entry
```

## NOTES
- **Hardware-validated 2026-09-14**: detect/open/write/close + write→readback round-trips (DPI, polling, sleep, buttons) against a live AJ159 Pro on 249a:5c2f, all restored to factory; RGB static-red visually confirmed, then restored to breathing
- **Artwork**: user-supplied AJ159P render + AJAZZ logo; no attack-shark branding remains (see grill session 2026-09-14)
- **Install script**: builds from the local checkout (no tarball download); udev rule is hidraw `TAG+="uaccess"`
- **Linux-first**: hidraw transport is Linux-specific; macOS/Windows would need an hidapi transport
