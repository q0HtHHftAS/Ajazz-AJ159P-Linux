# RENDERER COMPONENTS KNOWLEDGE BASE

**Parent:** ../../../AGENTS.md

## OVERVIEW
Vue 3 + Tailwind CSS + lucide-vue-next UI. Single-file `.vue` with `<script setup lang="ts">`. Layout: 3-column Dashboard (button remap + DPI | mouse render + reset | profiles + lighting/polling/sleep/stage-colors accordion).

## STRUCTURE
```
src/renderer/src/
├── App.vue                   # Shell: header (brand, model chip, battery), connect screen, Dashboard host
├── main.ts                   # createApp + vue-i18n (en only)
├── assets/main.css           # Theme CSS variables (--ajazz-*, --bg-*, --text-*)
├── assets/mouse-aj159p.png   # AJ159P render with hotspot dots overlay
├── components/
│   ├── Dashboard.vue         # Main 3-column UI (largest)
│   ├── BaseButton.vue        # Button (variants: minimal, green, red)
│   ├── BaseInput.vue         # Text input
│   ├── BaseSelect.vue        # Custom dropdown (string|number options)
│   ├── BaseSlider.vue        # Range slider
│   ├── BaseToggle.vue        # Toggle switch (currently unused)
│   ├── StatusMessage.vue     # Error/success banner
│   └── widgets/
│       ├── BatteryIndicator.vue  # Battery % / waiting-for-reading / disconnected
│       └── ToastStack.vue        # Toast notifications
├── composables/useToast.ts
├── env.d.ts                  # Window.api typing (mirrors preload)
└── shims-vue.d.ts
```

## WHERE TO LOOK
| Feature | Component | Key Props/Emits |
|---------|-----------|-----------------|
| Everything | Dashboard.vue | `isConnected`, `deviceModel`, `batteryLevel`, `@reset-complete` |
| Battery widget | widgets/BatteryIndicator.vue | `level`, `connected` |
| Toasts | widgets/ToastStack.vue | `toasts[]`, `@remove` |

## CONVENTIONS
- **`<script setup lang="ts">`** — Composition API, TypeScript
- **Tailwind utility classes** — custom CSS variables for theming (`--bg-primary`, `--text-primary`, `--ajazz-primary`, `--sidebar-bg`, etc.)
- **`lucide-vue-next` icons** — imported per-component
- **`vue-i18n`** — `useI18n()`, `$t('key')` in templates, `t('key')` in script; `locales/en.json`
- **IPC via `window.api`** — exposed by preload (getDpiTable/getLedEffect/getStageColors/getButtons/setButtons/setDpi/setRgb/setDpiColors/setPollingRate/setSleep/...)
- **Hardware is source of truth on mount** — Dashboard reads DPI table, LED effect, stage colors, polling, sleep, buttons from the device, then syncs the settings file
- **Button remap menu is floating** (`fixed` position) so the panel never grows or shifts layout
- **No fake controls** — every control maps to a hardware-validated report; unsupported features are omitted, not disabled

## ANTI-PATTERNS
- **No test coverage** — renderer components have zero tests
- **Never add UI for unvalidated protocol** — validate write→readback (or physical press) on hardware first
- **Never use inline-expanding menus in the fixed-size columns** — they push content out of view; use floating (`fixed`) panels
