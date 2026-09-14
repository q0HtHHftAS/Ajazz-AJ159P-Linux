# TEST CONVENTIONS KNOWLEDGE BASE

**Parent:** ../AGENTS.md

## OVERVIEW
89 tests across 12 files in `__tests__/`. Runner: `bun test` (Bun's built-in `bun:test`). No config files — relies on Bun's default `*.test.ts` discovery.

## STRUCTURE
```
__tests__/
├── AjazzAJ159P.test.ts       # 15 tests — driver with fake HidrawHandle transport
├── PollingRateBuilder.test.ts  # 5 tests — golden hex, interval table
├── SensorBuilder.test.ts       # 5 tests — live-reply RMW, golden hex
├── KeyTableBuilder.test.ts     # 7 tests — live-reply RMW, presets, golden hex
├── Queries.test.ts             # 7 tests — query build + DPI/battery/LED/colour reply parse
├── DpiColorBuilder.test.ts   # 6 tests — golden hex, validation
├── BatteryMonitor.test.ts    # 7 tests — parseBatteryFrame + polling (fake timers)
├── DpiBuilder.test.ts        # 8 tests — golden hex, validation
├── RgbBuilder.test.ts        # 8 tests — golden hex, validation
├── settingsManager.test.ts   # 8 tests — defaults, coercion, validation
├── profileManager.test.ts    # 12 tests — mocks electron + fs/promises
├── zzz-preload.test.ts       # 8 tests — static analysis of preload API surface
```

## WHERE TO LOOK
| Test File | Module Under Test | Key Patterns |
|-----------|-------------------|--------------|
| AjazzAJ159P.test.ts | core/AjazzAJ159P.ts | `createFakeHandle()` injected via `transport` option |
| BatteryMonitor.test.ts | core/BatteryMonitor.ts | `vi.useFakeTimers()` + sync `vi.advanceTimersByTime()` in try/finally |
| settingsManager.test.ts | storage/settingsManager.ts | Defaults, coercion, validation, deviceModel |
| profileManager.test.ts | storage/profileManager.ts | `vi.mock('electron')`, `vi.mock('fs/promises')` shared mocks |
| zzz-preload.test.ts | preload/index.ts | Static analysis of API surface (method names, imports) |
| *Builder.test.ts | protocols/*Builder.ts | Golden hex `builder.toString()`, validation throws |

## CONVENTIONS
- **Location**: `__tests__/<Module>.test.ts` at repo root (never colocated)
- **Imports**: NodeNext `.js` extension (`'../src/main/driver/protocols/DpiBuilder.js'`)
- **Barrel imports**: enums/types/errors from `'../src/main/driver/index.js'`
- **Structure**: `describe('<ClassName>')` → nested `describe('<methodName>()')` per public method
- **`bun:test` only**: `describe, it, expect, vi, beforeEach` from `'bun:test'`
- **Fake timers**: sync `vi.advanceTimersByTime()` only — this bun version has no `advanceTimersByTimeAsync`
- **Error assertions**: `toThrow(ParamsError)` / `toThrow(DriverError)` / etc. — project-specific classes
- **Golden hex**: `expect(builder.toString()).toBe('0003000125...')` — hardware reverse-engineering style
- **`@ts-expect-error test`** before deliberately-invalid calls (validates throw, bypasses `no-explicit-any: error`)

## ANTI-PATTERNS
- **No test for `src/main/index.ts` IPC layer** — gap (validation logic untested; zzz-preload only does static analysis)
- **No test for renderer components** — gap
- **`tsconfig.json` excludes `__tests__`** — tests never typechecked by `npm run typecheck`

## COMMANDS
```bash
bun test                              # all 89 tests
bun test __tests__/AjazzAJ159P.test.ts
bun test __tests__/BatteryMonitor.test.ts
bun test --coverage                   # coverage/ (gitignored)
```
