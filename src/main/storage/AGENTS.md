# STORAGE KNOWLEDGE BASE

**Generated:** 2026-08-04
**Parent:** ../../AGENTS.md

## OVERVIEW
JSON file persistence for settings and profiles. Uses Electron `app.getPath('userData')` for cross-platform storage location.

## STRUCTURE
```
src/main/storage/
├── settingsManager.ts   # AppSettings persistence (type-safe load/save)
└── profileManager.ts    # Profile CRUD (name + arbitrary data)
```

## WHERE TO LOOK
| Task | File | Key Exports |
|------|------|-------------|
| Load settings (with defaults/validation) | settingsManager.ts | `getSettings(): Promise<AppSettings>` |
| Save settings | settingsManager.ts | `saveSettings(settings: AppSettings): Promise<void>` |
| List profile names | profileManager.ts | `listProfiles(): Promise<string[]>` |
| Save profile (name + data) | profileManager.ts | `saveProfile(name, data): Promise<void>` |
| Load profile by name | profileManager.ts | `loadProfile(name): Promise<unknown>` |
| Delete profile | profileManager.ts | `deleteProfile(name): Promise<void>` |

## CONVENTIONS
- **Storage path**: `path.join(app.getPath('userData'), 'settings.json')` / `'profiles.json'`
- **`AppSettings` interface** (settingsManager.ts:8-29): lastTab, connectionMode, deviceModel, language, theme, preferences (lightMode, ledSpeed, keyResponse, pollingRate, sleepTime, deepSleepTime, rgb), dpi (selected, values[6]), rgb (mode, color, brightness, speed, colors[6]), pollingRate, sleepMinutes
- **Defaults**: AJ159P model, pollingRate 1000, sleepMinutes 5, static lighting, DPI [1600,3200,4800,6400,12800,23200] stage 2
- **Type-safe loading**: `getSettings()` merges saved JSON over `DEFAULT_SETTINGS`, coerces numbers via `toNum()`, fixes `deviceModel` ('AJ159Pro' or 'AJ159P'), validates polling/sleep/colors
- **Profile data**: arbitrary `unknown` — no schema enforcement; stored as `{name, data}[]` array
- **Atomic writes**: `fs.writeFile` with `JSON.stringify(settings, null, 2)`
- **Error handling**: `getSettings()` returns defaults on any read/parse error; `profileManager` returns empty array/null

## ANTI-PATTERNS
- **No test coverage** — `settingsManager.ts` and `profileManager.ts` have no dedicated test files (only indirectly tested via IPC in main/index.ts)
- **No migration logic** — `getSettings()` merges over defaults but doesn't handle schema versioning
- **Profile data is `unknown`** — no runtime validation on load; caller must validate

## TESTS
- `__tests__/profileManager.test.ts` — mocks `electron` + `fs/promises`, 12 tests
- **No test for settingsManager** — gap