# DRIVER PROTOCOLS KNOWLEDGE BASE

**Parent:** ../AGENTS.md

## OVERVIEW
Report builders — one class per 33-byte HID report. Each exposes `build(): Buffer` and `toString(): string` (hex, used by golden tests). Checksum for all reports: `sum(bytes[5..31]) & 0xff` in the last byte.

## STRUCTURE
```
src/main/driver/protocols/
├── DpiBuilder.ts       # Report 00 03 00 01 25 — 6-stage DPI + active stage
├── DpiColorBuilder.ts  # Report 00 04 00 01 12 — stage-indicator colours (visible LED)
├── RgbBuilder.ts       # Report 00 05 00 01 — off/static/breathing + brightness/speed
```

## WHERE TO LOOK
| Report | File | Key details |
|--------|------|-------------|
| DPI | DpiBuilder.ts | `selected` 1..6 → high nibble of byte 5; values 100..26000 step 100, `value/100` as u16LE duplicated |
| Stage colours | DpiColorBuilder.ts | 6 RGB triplets at bytes 5..22 — THE colour system (firmware ignores static-report RGB) |
| Lighting | RgbBuilder.ts | off=`02 00`, breathing=`18 02` (+ fixed 7-colour palette), static=`05 03`; brightness\|speed nibbles at byte 6 |

## CONVENTIONS
- **Builder pattern**: `new Builder(options).setX(v).build()` — setters return `this`, invalid input throws `ParamsError`
- **Golden hex**: every layout asserted in `__tests__/<Builder>.test.ts` against packets captured from the official driver
- **Colour format**: `#rrggbb` strings, lowercased on normalize

## TESTS
- `__tests__/DpiBuilder.test.ts`, `__tests__/RgbBuilder.test.ts`, plus PollingRate/Sensor/KeyTable/Queries tests
