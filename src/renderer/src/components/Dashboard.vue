<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Trash2, ChevronDown, RotateCcw, Check, ArrowLeftRight } from 'lucide-vue-next';
import BaseButton from './BaseButton.vue';
import BaseInput from './BaseInput.vue';
import BaseSelect from './BaseSelect.vue';
import BaseSlider from './BaseSlider.vue';
import BaseToggle from './BaseToggle.vue';
import StatusMessage from './StatusMessage.vue';
import { useToast } from '../composables/useToast';
import mouseImg from '../assets/mouse-aj159p.png';

const props = withDefaults(
	defineProps<{
		isConnected: boolean;
		deviceModel: 'AJ159P' | 'AJ159Pro';
		connectionKind: 'wireless' | 'wired';
		batteryLevel: number;
		/** Manual refresh mounts read hardware without writing back. */
		syncOnMount?: boolean;
	}>(),
	{ syncOnMount: true },
);

const emit = defineEmits<{
	'reset-complete': [];
	refreshed: [];
}>();

const { t } = useI18n();
const { success: toastSuccess, error: toastError } = useToast();

// Auto Sync toggle (persisted to settings.json, default on).
const autoSync = ref(true);

const persistAutoSync = async () => {
	try {
		const s = await window.api.getSettings();
		if (!s) return;
		await window.api.saveSettings({ ...s, autoSync: autoSync.value });
	} catch {
		// toggle state stands; retried on the next change
	}
};

// ---------------------------------------------------------------- state
const FACTORY_DPI = [1600, 3200, 4800, 6400, 12800, 23200] as [number, number, number, number, number, number];
const dpi = reactive({
	selected: 2,
	values: FACTORY_DPI.slice() as [number, number, number, number, number, number],
});

const lighting = reactive({
	mode: 'static' as 'off' | 'static' | 'breathing',
	color: '#8b5cf6',
	brightness: 4,
	speed: 2,
	colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'] as [
		string,
		string,
		string,
		string,
		string,
		string,
	],
});

const DPI_MIN = 100;
const DPI_MAX = 26000;
const DPI_STEP = 100;

const POLLING_OPTIONS = [
	{ label: '125 Hz', value: 125 },
	{ label: '250 Hz', value: 250 },
	{ label: '500 Hz', value: 500 },
	{ label: '1000 Hz', value: 1000 },
];

const SLEEP_OPTIONS = [
	{ label: '10 seconds', value: 10 / 60 },
	{ label: '30 seconds', value: 30 / 60 },
	{ label: '1 minute', value: 1 },
	{ label: '2 minutes', value: 2 },
	{ label: '5 minutes', value: 5 },
	{ label: '10 minutes', value: 10 },
	{ label: '20 minutes', value: 20 },
	{ label: '30 minutes', value: 30 },
];

const BUTTON_NAMES = ['Left Button', 'Right Button', 'Middle Button', 'Forward Button', 'Backward Button'];

const BUTTON_PRESET_OPTIONS = [
	{ label: 'Default', value: 'default' },
	{ label: 'Left Click', value: 'left' },
	{ label: 'Right Click', value: 'right' },
	{ label: 'Middle Click', value: 'middle' },
	{ label: 'Forward', value: 'forward' },
	{ label: 'Backward', value: 'backward' },
	{ label: 'Volume +', value: 'vol-up' },
	{ label: 'Volume -', value: 'vol-down' },
	{ label: 'Mute', value: 'mute' },
	{ label: 'Play / Pause', value: 'play-pause' },
	{ label: 'Copy', value: 'copy' },
	{ label: 'Paste', value: 'paste' },
	{ label: 'Custom (on device)', value: 'custom' },
];

// Hotspot dots over the mouse render (percent coordinates, measured from
// mouse-aj159p.png: wheel centroid, side-button clusters, click-zone edges).
// Numbered like the vendor driver: 1 left, 2 right, 3 middle, 4 forward, 5 back.
const DOTS = [
	{ n: 1, button: 0, x: 39, y: 33 },
	{ n: 2, button: 1, x: 62, y: 33 },
	{ n: 3, button: 2, x: 50, y: 22 },
	{ n: 4, button: 3, x: 27, y: 41 },
	{ n: 5, button: 4, x: 27, y: 53 },
];
const selectedButton = ref(0);
const expandedButton = ref<number | null>(null);
const menuAnchor = ref({ top: 0, left: 0, width: 240 });

const presetLabel = (id: string): string => BUTTON_PRESET_OPTIONS.find((o) => o.value === id)?.label ?? id;

interface PresetGroup {
	label: string | null;
	items: string[];
}
const PRESET_GROUPS: PresetGroup[] = [
	{ label: null, items: ['default'] },
	{ label: 'Mouse', items: ['left', 'right', 'middle', 'forward', 'backward'] },
	{ label: 'Media', items: ['vol-up', 'vol-down', 'mute', 'play-pause'] },
	{ label: 'Keyboard', items: ['copy', 'paste'] },
];

const toggleButtonRow = (i: number, ev?: MouseEvent) => {
	selectedButton.value = i;
	if (expandedButton.value === i) {
		expandedButton.value = null;
		return;
	}
	// Float the menu (fixed position) so the panel never grows or shifts layout.
	const target = (ev?.currentTarget ?? null) as HTMLElement | null;
	const rect = target?.getBoundingClientRect();
	if (rect) {
		// Two-column grid: header + default + divider + labels + ~6 grid rows.
		const estH = 56 + 32 + 12 + PRESET_GROUPS.length * 22 + 6 * 32 + 16;
		const width = Math.max(rect.width, 300);
		const top = Math.max(8, Math.min(rect.top, window.innerHeight - estH - 8));
		menuAnchor.value = { top, left: Math.min(rect.right + 6, window.innerWidth - width - 8), width };
	}
	expandedButton.value = i;
};

const closeButtonMenu = () => {
	expandedButton.value = null;
};

const selectPreset = async (i: number, value: string) => {
	buttonPresets.value[i] = value;
	expandedButton.value = null;
	await applyButtons();
};

// Orange fill up to the thumb (Chromium has no native fill for range inputs)
const dpiFill = (i: number): string => {
	const v = Math.max(DPI_MIN, Math.min(DPI_MAX, dpi.values[i - 1] ?? DPI_MIN));
	const p = ((v - DPI_MIN) / (DPI_MAX - DPI_MIN)) * 100;
	return `background: linear-gradient(to top, #E95420 ${p}%, var(--bg-primary) ${p}%)`;
};

// Click a value to type it in directly (easier than dragging to an exact DPI)
const editingStage = ref<number | null>(null);

// ---------------------------------------------------------------- left column (DPI)
const leftStatus = ref('');
const leftError = ref(false);
const applyingDpi = ref(false);

const clampDpi = (v: number): number => {
	const stepped = Math.round(v / DPI_STEP) * DPI_STEP;
	return Math.max(DPI_MIN, Math.min(DPI_MAX, stepped));
};

const applyDpi = async (showUi = true) => {
	if (!props.isConnected) return;
	if (showUi) {
		applyingDpi.value = true;
		leftError.value = false;
		leftStatus.value = t('dpi.updating');
	}
	try {
		await window.api.setDpi({ selected: dpi.selected, values: [...dpi.values] });
		if (showUi) {
			leftStatus.value = '';
			toastSuccess(t('dpi.applied'));
		}
	} catch (err: unknown) {
		const message = `${t('dpi.error')}: ${err instanceof Error ? err.message : String(err)}`;
		leftError.value = true;
		leftStatus.value = message;
		toastError(message);
	} finally {
		if (showUi) applyingDpi.value = false;
	}
};

// ---------------------------------------------------------------- right column (lighting)
const rightStatus = ref('');
const rightError = ref(false);

let lightingTimer: ReturnType<typeof setTimeout>;
const applyLighting = async (showUi = true) => {
	if (!props.isConnected) return;
	if (showUi) {
		rightError.value = false;
		rightStatus.value = t('lighting.applying');
	}
	try {
		await window.api.setRgb({
			mode: lighting.mode,
			color: lighting.color,
			brightness: lighting.brightness,
			speed: lighting.speed,
		});
		if (showUi) {
			rightStatus.value = '';
			toastSuccess(t('lighting.applied'));
		}
	} catch (err: unknown) {
		const message = `${t('lighting.error')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	}
};

const scheduleLightingApply = () => {
	clearTimeout(lightingTimer);
	lightingTimer = setTimeout(() => void applyLighting(false), 400);
	void persistSettings();
};

// The indicator LED channels are binary (on/off) — the firmware's own
// palette is exactly the 8 combinations. Only these display correctly.
const LED_COLORS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00', '#ffffff'];

const applyingColors = ref(false);
const allStageColor = ref('#ff0000');

const setStageColor = (i: number, color: string) => {
	lighting.colors[i] = color;
	void applyStageColors();
};

const applyAllStageColors = () => {
	lighting.colors = [
		allStageColor.value,
		allStageColor.value,
		allStageColor.value,
		allStageColor.value,
		allStageColor.value,
		allStageColor.value,
	];
	void applyStageColors();
};
const applyStageColors = async (showUi = true) => {
	if (!props.isConnected) return;
	if (showUi) {
		applyingColors.value = true;
		rightError.value = false;
		rightStatus.value = t('lighting.applyingColors');
	}
	try {
		await window.api.setDpiColors({ colors: [...lighting.colors] });
		if (showUi) {
			rightStatus.value = '';
			toastSuccess(t('lighting.applied'));
		}
		void persistSettings();
	} catch (err: unknown) {
		const message = `${t('lighting.error')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	} finally {
		if (showUi) applyingColors.value = false;
	}
};

// ---------------------------------------------------------------- polling / sleep / buttons
const pollingRate = ref(1000);
const sleepMinutes = ref(5);
const buttonPresets = ref<string[]>(['default', 'default', 'default', 'default', 'default']);
const applyingDevice = ref(false);

const applyPolling = async (showUi = true) => {
	if (!props.isConnected) return;
	if (showUi) {
		rightError.value = false;
		rightStatus.value = t('polling.applying');
	}
	try {
		await window.api.setPollingRate(pollingRate.value);
		if (showUi) {
			rightStatus.value = '';
			// SET reports are fire-and-forget — read back 0x12 so a silently
			// ignored write shows up instead of a lying green toast.
			let actual: number | null = null;
			try {
				actual = await window.api.getPollingRate();
			} catch {
				actual = null;
			}
			if (actual === pollingRate.value) {
				toastSuccess(t('polling.verified', { rate: actual }));
			} else {
				const message = t('polling.unverified', {
					want: pollingRate.value,
					got: actual ?? t('overview.batteryUnknown'),
				});
				rightError.value = true;
				rightStatus.value = message;
				toastError(message);
			}
		}
		void persistSettings();
	} catch (err: unknown) {
		const message = `${t('polling.error')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	}
};

const applySleep = async (showUi = true) => {
	if (!props.isConnected) return;
	if (showUi) {
		rightError.value = false;
		rightStatus.value = t('sleep.applying');
	}
	try {
		await window.api.setSleep(sleepMinutes.value);
		if (showUi) {
			rightStatus.value = '';
			toastSuccess(t('sleep.applied'));
		}
		void persistSettings();
	} catch (err: unknown) {
		const message = `${t('sleep.error')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	}
};

const applyButtons = async (showUi = true) => {
	if (!props.isConnected || applyingDevice.value) return;
	applyingDevice.value = true;
	if (showUi) {
		leftError.value = false;
		leftStatus.value = t('buttons.applying');
	}
	try {
		await window.api.setButtons([...buttonPresets.value]);
		if (showUi) {
			leftStatus.value = '';
			// Read back 0x11: the firmware may silently drop presets it does
			// not support (as it does with macros) — surface that per slot.
			let mismatched: number[] = [];
			let unreadable = false;
			try {
				const actual = await window.api.getButtons();
				buttonPresets.value.forEach((want, i) => {
					if (want !== 'custom' && actual[i] !== want) mismatched.push(i + 1);
				});
			} catch {
				unreadable = true;
			}
			if (!unreadable && mismatched.length === 0) {
				toastSuccess(t('buttons.verified'));
			} else {
				const message = t('buttons.notAccepted', {
					slots: unreadable ? t('overview.batteryUnknown') : mismatched.join(', '),
				});
				leftError.value = true;
				leftStatus.value = message;
				toastError(message);
			}
		}
		void persistSettings();
	} catch (err: unknown) {
		const message = `${t('buttons.error')}: ${err instanceof Error ? err.message : String(err)}`;
		leftError.value = true;
		leftStatus.value = message;
		toastError(message);
	} finally {
		applyingDevice.value = false;
	}
};

const loadDeviceState = async () => {
	try {
		const table = (await window.api.getDpiTable()) as {
			selected: number;
			values: number[];
		} | null;
		if (table && Number.isInteger(table.selected) && Array.isArray(table.values) && table.values.length === 6) {
			dpi.selected = Math.max(1, Math.min(6, table.selected));
			dpi.values = table.values.map((v) => clampDpi(v)) as typeof dpi.values;
		}
	} catch {
		// keep settings-file values
	}
	try {
		const led = (await window.api.getLedEffect()) as {
			mode: string;
			brightness: number;
			speed: number;
		} | null;
		if (led && (led.mode === 'off' || led.mode === 'static' || led.mode === 'breathing')) {
			lighting.mode = led.mode;
			// Brightness/speed are only meaningful while an effect is active:
			// an `off` reply carries zero payload that must not clobber the
			// saved values (it would dim the LED to 0 on the next apply).
			if (led.mode !== 'off') {
				if (Number.isInteger(led.brightness) && led.brightness >= 0 && led.brightness <= 4) {
					lighting.brightness = led.brightness;
				}
				if (Number.isInteger(led.speed) && led.speed >= 0 && led.speed <= 4) {
					lighting.speed = led.speed;
				}
			}
		}
	} catch {
		// keep settings-file values
	}
	try {
		const rate = await window.api.getPollingRate();
		if (rate !== null) pollingRate.value = rate;
	} catch {
		// keep default
	}
	try {
		const sensor = (await window.api.getSensor()) as { sleepMinutes: number } | null;
		if (sensor && typeof sensor.sleepMinutes === 'number') {
			// Snap to the nearest offered preset.
			let best = SLEEP_OPTIONS[4]?.value ?? 5;
			let bestDiff = Math.abs(best - sensor.sleepMinutes);
			for (const opt of SLEEP_OPTIONS) {
				const diff = Math.abs(opt.value - sensor.sleepMinutes);
				if (diff < bestDiff) {
					best = opt.value;
					bestDiff = diff;
				}
			}
			sleepMinutes.value = best;
		}
	} catch {
		// keep default
	}
	try {
		const presets = await window.api.getButtons();
		if (Array.isArray(presets) && presets.length === 5) buttonPresets.value = presets;
	} catch {
		// keep defaults
	}
	try {
		const stored = (await window.api.getStageColors()) as unknown;
		if (
			Array.isArray(stored) &&
			stored.length === 6 &&
			stored.every((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
		) {
			lighting.colors = [...stored] as typeof lighting.colors;
		}
	} catch {
		// keep settings-file values
	}
	// Sync the hardware truth back to the settings file.
	void persistSettings();
};

// ---------------------------------------------------------------- connection-mode sync
// Wired and wireless keep separate on-device profiles: re-applying the
// current settings writes them to whichever mode is connected now.
const syncingMode = ref(false);

const syncCurrentSettings = async () => {
	if (!props.isConnected || syncingMode.value) return;
	if (!window.confirm(t('connection.syncConfirm'))) return;
	syncingMode.value = true;
	rightError.value = false;
	rightStatus.value = t('connection.syncing');
	try {
		await window.api.setDpi({ selected: dpi.selected, values: [...dpi.values] });
		await window.api.setRgb({
			mode: lighting.mode,
			color: lighting.color,
			brightness: lighting.brightness,
			speed: lighting.speed,
		});
		await window.api.setDpiColors({ colors: [...lighting.colors] });
		await window.api.setPollingRate(pollingRate.value);
		await window.api.setSleep(sleepMinutes.value);
		await window.api.setButtons([...buttonPresets.value]);
		void persistSettings();
		rightStatus.value = '';
		toastSuccess(t('connection.synced'));
	} catch (err: unknown) {
		const message = `${t('connection.syncError')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	} finally {
		syncingMode.value = false;
	}
};

// ---------------------------------------------------------------- profiles
const profiles = ref<string[]>([]);
const newProfileName = ref('');

const loadProfiles = async () => {
	profiles.value = await window.api.listProfiles();
};

const saveProfile = async () => {
	if (!newProfileName.value) return;
	await window.api.saveProfile(newProfileName.value, {
		dpi: JSON.parse(JSON.stringify(dpi)),
		rgb: JSON.parse(JSON.stringify(lighting)),
		colors: [...lighting.colors],
		pollingRate: pollingRate.value,
		sleepMinutes: sleepMinutes.value,
		buttons: [...buttonPresets.value],
	});
	newProfileName.value = '';
	await loadProfiles();
};

const applyProfile = async (name: string) => {
	if (!props.isConnected) return;
	rightError.value = false;
	try {
		const data = (await window.api.loadProfile(name)) as {
			dpi?: typeof dpi;
			rgb?: typeof lighting;
			pollingRate?: number;
			sleepMinutes?: number;
			buttons?: string[];
			colors?: unknown;
		} | null;
		if (!data) return;
		if (data.dpi) {
			Object.assign(dpi, data.dpi);
			await applyDpi(false);
		}
		if (data.rgb) {
			Object.assign(lighting, data.rgb);
			await applyLighting(false);
		}
		if (Array.isArray(data.colors) && data.colors.length === 6) {
			const colors = data.colors;
			if (colors.every((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) {
				lighting.colors = [...colors] as typeof lighting.colors;
				await window.api.setDpiColors({ colors: [...lighting.colors] });
			}
		}
		if (typeof data.pollingRate === 'number') {
			pollingRate.value = data.pollingRate;
			await applyPolling(false);
		}
		if (typeof data.sleepMinutes === 'number') {
			sleepMinutes.value = data.sleepMinutes;
			await applySleep(false);
		}
		if (Array.isArray(data.buttons) && data.buttons.length === 5) {
			buttonPresets.value = data.buttons;
			await applyButtons(false);
		}
		void persistSettings();
		rightStatus.value = '';
		toastSuccess(t('preferences.settingsApplied'));
	} catch (err: unknown) {
		const message = `${t('lighting.error')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	}
};

const deleteProfile = async (name: string) => {
	await window.api.deleteProfile(name);
	await loadProfiles();
};

// ---------------------------------------------------------------- reset
const resetting = ref(false);

const resetDevice = async () => {
	if (!props.isConnected || resetting.value) return;
	if (!window.confirm(t('reset.confirm'))) return;
	resetting.value = true;
	try {
		await window.api.resetDevice();
		emit('reset-complete');
	} catch (err: unknown) {
		const message = `${t('reset.failed')}: ${err instanceof Error ? err.message : String(err)}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	} finally {
		resetting.value = false;
	}
};

// ---------------------------------------------------------------- collapsibles
// Accordion: at most one section open, so the right column never overflows
// the fixed-size window (no scrollbar). Clicking the open section collapses all.
const openSection = ref<string | null>('light');
const toggleSection = (key: string) => {
	openSection.value = openSection.value === key ? null : key;
};

const lightModes = computed(() => [
	{ label: t('lighting.modes.off'), value: 'off' },
	{ label: t('lighting.modes.static'), value: 'static' },
	{ label: t('lighting.modes.breathing'), value: 'breathing' },
]);

// The visible indicator LED shows the per-stage colour below — that table
// IS the mouse's colour system. (The RGB triplet in the static-lighting
// report is ignored by this firmware, so static mode offers no colour
// picker.) Breathing cycles a fixed firmware palette.
const BREATHING_PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ffff00', '#ff00ff', '#ffffff'];

const persistSettings = async () => {
	const s = await window.api.getSettings();
	if (!s) return;
	await window.api.saveSettings({
		...s,
		pollingRate: pollingRate.value,
		sleepMinutes: sleepMinutes.value,
		buttons: [...buttonPresets.value] as [string, string, string, string, string],
		dpi: { selected: dpi.selected, values: [...dpi.values] as typeof dpi.values },
		rgb: {
			mode: lighting.mode,
			color: lighting.color,
			brightness: lighting.brightness,
			speed: lighting.speed,
			colors: [...lighting.colors] as typeof lighting.colors,
		},
	});
};

interface FileSnapshot {
	dpi: { selected: number; values: [number, number, number, number, number, number] };
	mode: 'off' | 'static' | 'breathing';
	color: string;
	brightness: number;
	speed: number;
	colors: [string, string, string, string, string, string];
	pollingRate: number;
	sleepMinutes: number;
	buttons: string[];
}

const snapshotFileState = (): FileSnapshot => ({
	dpi: { selected: dpi.selected, values: [...dpi.values] },
	mode: lighting.mode,
	color: lighting.color,
	brightness: lighting.brightness,
	speed: lighting.speed,
	colors: [...lighting.colors],
	pollingRate: pollingRate.value,
	sleepMinutes: sleepMinutes.value,
	buttons: [...buttonPresets.value],
});

const snapSleepToPreset = (minutes: number): number => {
	let best = SLEEP_OPTIONS[4]?.value ?? 5;
	let bestDiff = Math.abs(best - minutes);
	for (const opt of SLEEP_OPTIONS) {
		const diff = Math.abs(opt.value - minutes);
		if (diff < bestDiff) {
			best = opt.value;
			bestDiff = diff;
		}
	}
	return best;
};

/**
 * Auto Sync: writes the settings-file values to the connected mode, but only
 * for sections that differ from what the mouse currently holds. Silent when
 * already in sync; a single summary toast otherwise.
 */
const autoSyncFromFile = async (file: FileSnapshot) => {
	if (!props.isConnected) return;
	const modeLabel = props.connectionKind === 'wired' ? t('connection.wired') : t('overview.wireless');
	const written: string[] = [];
	const failed: string[] = [];
	const trySection = async (name: string, write: () => Promise<unknown>, apply: () => void) => {
		try {
			await write();
			apply();
			written.push(name);
		} catch {
			failed.push(name);
		}
	};
	if (file.dpi.selected !== dpi.selected || file.dpi.values.some((v, i) => v !== dpi.values[i])) {
		await trySection(
			t('dashboard.dpiSettings'),
			() => window.api.setDpi({ selected: file.dpi.selected, values: [...file.dpi.values] }),
			() => {
				dpi.selected = file.dpi.selected;
				dpi.values = [...file.dpi.values];
			},
		);
	}
	// The static colour triplet is write-only (firmware ignores it), so the
	// diff covers mode/brightness/speed only — the file colour still rides
	// along on the write.
	if (file.mode !== lighting.mode || file.brightness !== lighting.brightness || file.speed !== lighting.speed) {
		await trySection(
			t('dashboard.lightSettings'),
			() =>
				window.api.setRgb({
					mode: file.mode,
					color: file.color,
					brightness: file.brightness,
					speed: file.speed,
				}),
			() => {
				lighting.mode = file.mode;
				lighting.brightness = file.brightness;
				lighting.speed = file.speed;
			},
		);
	}
	if (file.colors.some((c, i) => c.toLowerCase() !== (lighting.colors[i] ?? '').toLowerCase())) {
		await trySection(
			t('dashboard.stageColors'),
			() => window.api.setDpiColors({ colors: [...file.colors] }),
			() => {
				lighting.colors = [...file.colors];
			},
		);
	}
	if (file.pollingRate !== pollingRate.value) {
		await trySection(
			t('dashboard.pollingSettings'),
			() => window.api.setPollingRate(file.pollingRate),
			() => {
				pollingRate.value = file.pollingRate;
			},
		);
	}
	if (snapSleepToPreset(file.sleepMinutes) !== snapSleepToPreset(sleepMinutes.value)) {
		await trySection(
			t('dashboard.sleepSettings'),
			() => window.api.setSleep(file.sleepMinutes),
			() => {
				sleepMinutes.value = file.sleepMinutes;
			},
		);
	}
	// A file slot of 'custom' means "leave the on-device slot untouched".
	if (file.buttons.some((p, i) => p !== 'custom' && p !== buttonPresets.value[i])) {
		await trySection(
			t('dashboard.buttonSettings'),
			() => window.api.setButtons([...file.buttons]),
			() => {
				buttonPresets.value = [...file.buttons];
			},
		);
	}
	if (written.length > 0 || failed.length > 0) void persistSettings();
	if (written.length > 0) {
		toastSuccess(t('connection.syncedParts', { parts: written.join(', '), mode: modeLabel }));
	}
	if (failed.length > 0) {
		const message = `${t('connection.syncFailedParts', { parts: failed.join(', '), mode: modeLabel })}`;
		rightError.value = true;
		rightStatus.value = message;
		toastError(message);
	}
};

onMounted(async () => {
	await loadProfiles();
	let fileSnap: FileSnapshot | null = null;
	try {
		const settings = await window.api.getSettings();
		if (settings?.dpi) {
			dpi.selected = settings.dpi.selected;
			dpi.values = settings.dpi.values.map((v) => clampDpi(v)) as typeof dpi.values;
		}
		if (settings?.rgb) Object.assign(lighting, settings.rgb);
		if (typeof settings?.pollingRate === 'number') pollingRate.value = settings.pollingRate;
		if (typeof settings?.sleepMinutes === 'number') sleepMinutes.value = settings.sleepMinutes;
		if (Array.isArray(settings?.buttons) && settings.buttons.length === 5) {
			buttonPresets.value = [...settings.buttons];
		}
		autoSync.value = settings?.autoSync !== false;
		fileSnap = snapshotFileState();
	} catch {
		// defaults stand
	}
	// Hardware is the source of truth for polling/sleep/buttons.
	await loadDeviceState();
	// ...unless Auto Sync is on, in which case the file wins on differing sections.
	// Manual refresh mounts (syncOnMount=false) only read.
	if (fileSnap && autoSync.value && props.syncOnMount) await autoSyncFromFile(fileSnap);
	emit('refreshed');
});
</script>

<template>
	<div class="space-y-3">
		<div class="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-3 items-start">
			<!-- ================= LEFT ================= -->
			<div class="space-y-3">
				<!-- Button Settings (each row expands to a preset list, like the vendor driver) -->
				<section class="yaru-enter relative bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)]">
					<header
						class="px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] border-b border-[var(--border-card)]"
					>
						{{ $t('dashboard.buttonSettings') }}
					</header>
					<div class="p-3 space-y-1.5">
						<div v-for="(name, i) in BUTTON_NAMES" :key="i">
							<button
								@click="toggleButtonRow(i, $event)"
								:class="[
									'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all',
									selectedButton === i || expandedButton === i
										? 'bg-[#E95420]/15 text-[#f9a88a] shadow-[inset_0_0_0_1px_rgba(233,84,32,0.5)]'
										: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
								]"
							>
								<span
									:class="[
										'w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold flex-shrink-0',
										selectedButton === i
											? 'bg-[#E95420] text-white'
											: 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
									]"
								>
									{{ i + 1 }}
								</span>
								<span class="flex-1 min-w-0 text-left">
									<span class="block truncate">{{ name }}</span>
									<span class="block truncate text-xs opacity-60">{{
										presetLabel(buttonPresets[i] ?? 'default')
									}}</span>
								</span>
								<ChevronDown
									class="w-4 h-4 flex-shrink-0 transition-transform duration-200"
									:class="expandedButton === i ? 'rotate-180' : ''"
								/>
							</button>
						</div>
					</div>
				</section>

				<section
					class="yaru-enter yaru-enter-1 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] overflow-hidden"
				>
					<header
						class="px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] border-b border-[var(--border-card)]"
					>
						{{ $t('dashboard.dpiSettings') }}
					</header>
					<div class="p-3">
						<div class="flex justify-between gap-1">
							<div
								v-for="i in 6"
								:key="i"
								:class="[
									'flex flex-1 min-w-0 flex-col items-center gap-1.5 rounded-lg py-1.5 transition-colors',
									dpi.selected === i ? 'bg-[#E95420]/10' : '',
								]"
							>
								<button
									v-if="editingStage !== i"
									@click="editingStage = i"
									class="w-full truncate text-center text-[10px] font-bold tabular-nums rounded-md px-0.5 py-1 bg-white text-black hover:bg-neutral-200 transition-colors"
									:class="dpi.selected === i ? 'outline outline-2 outline-[#E95420]' : ''"
									:title="'Click to type a DPI value'"
								>
									{{ dpi.values[i - 1] }}
								</button>
								<input
									v-else
									type="number"
									v-model.number="dpi.values[i - 1]"
									:min="DPI_MIN"
									:max="DPI_MAX"
									:step="DPI_STEP"
									@blur="
										dpi.values[i - 1] = clampDpi(dpi.values[i - 1] ?? DPI_MIN);
										editingStage = null;
									"
									@keyup.enter="($event.target as HTMLInputElement).blur()"
									class="w-full text-center text-[10px] font-bold tabular-nums bg-[var(--bg-primary)] border border-[#E95420] rounded-md py-1 text-[var(--text-primary)] focus:outline-none"
								/>
								<div class="h-32 flex items-center justify-center overflow-visible">
									<BaseSlider
										v-model="dpi.values[i - 1]"
										:min="DPI_MIN"
										:max="DPI_MAX"
										:step="DPI_STEP"
										:style="dpiFill(i)"
										class="dpi-vertical"
										orient="vertical"
									/>
								</div>
								<button
									@click="dpi.selected = i"
									:class="[
										'w-6 h-6 rounded-full text-[11px] font-bold transition-all',
										dpi.selected === i
											? 'bg-[#E95420] text-white'
											: 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
									]"
								>
									{{ i }}
								</button>
							</div>
						</div>
						<div
							class="flex items-center justify-between px-1.5 pt-2 text-[10px] tabular-nums text-[var(--text-muted)]"
						>
							<span>{{ DPI_MIN }} – {{ DPI_MAX }} DPI</span>
							<span>{{ $t('dashboard.activeStage', { stage: dpi.selected }) }}</span>
						</div>
						<BaseButton
							@click="applyDpi(true)"
							:disabled="!isConnected || applyingDpi"
							variant="green"
							class="w-full mt-1"
						>
							{{ applyingDpi ? $t('dpi.updating') : $t('dashboard.apply') }}
						</BaseButton>
					</div>
				</section>

				<StatusMessage :message="leftStatus" :type="leftError ? 'error' : 'success'" />
			</div>

			<!-- ================= CENTER ================= -->
			<!-- self-start (not stretch): the mouse must not move when accordion
			sections in the side columns open and grow the row. -->
			<div class="yaru-enter yaru-enter-1 self-start w-full flex flex-col items-center justify-start py-2 gap-3">
				<div class="relative w-fit select-none">
					<img
						:src="mouseImg"
						alt="AJAZZ AJ159P"
						class="w-auto"
						style="height: min(560px, calc(100vh - 300px))"
						draggable="false"
					/>
					<button
						v-for="d in DOTS"
						:key="d.n"
						@click="toggleButtonRow(d.button, $event)"
						:aria-label="BUTTON_NAMES[d.button]"
						:title="BUTTON_NAMES[d.button]"
						class="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
						:style="{ left: d.x + '%', top: d.y + '%' }"
					>
						<span
							:class="[
								'hotspot-dot block w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all',
								selectedButton === d.button
									? 'bg-[#E95420] text-white scale-125'
									: 'bg-white text-[#E95420] border-2 border-[#E95420] hover:scale-125',
							]"
						>
							{{ d.n }}
						</span>
					</button>
				</div>
				<BaseButton @click="resetDevice" :disabled="!isConnected || resetting" variant="red" class="text-xs">
					<RotateCcw class="w-3.5 h-3.5 inline mr-1" />
					{{ resetting ? $t('reset.resetting') : $t('reset.button') }}
				</BaseButton>
			</div>

			<!-- ================= RIGHT ================= -->
			<div class="space-y-5">
				<!-- Profile -->
				<section
					class="yaru-enter yaru-enter-2 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] overflow-hidden"
				>
					<header
						class="px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] border-b border-[var(--border-card)]"
					>
						{{ $t('dashboard.profile') }}
					</header>
					<div class="p-3 space-y-2">
						<button
							v-for="p in profiles"
							:key="p"
							@click="applyProfile(p)"
							class="w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--bg-primary)] border border-[var(--border-card)] hover:border-[#E95420]/60 transition-all"
						>
							<span class="flex-1 truncate text-left text-[var(--text-primary)]">{{ p }}</span>
							<Trash2
								class="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
								@click.stop="deleteProfile(p)"
							/>
						</button>
						<p v-if="profiles.length === 0" class="text-xs text-[var(--text-muted)] px-1 py-2 text-center">
							{{ $t('dashboard.noProfiles') }}
						</p>
						<div class="flex gap-2">
							<BaseInput
								v-model="newProfileName"
								:placeholder="$t('preferences.newProfilePlaceholder')"
								class="flex-1 min-w-0"
							/>
							<button
								@click="saveProfile"
								:disabled="!newProfileName"
								class="px-3 rounded-lg bg-[var(--bg-elevated)] hover:bg-[#E95420] hover:text-white text-[var(--text-secondary)] transition-all disabled:opacity-40"
								:aria-label="$t('preferences.saveProfile')"
							>
								<Plus class="w-4 h-4" />
							</button>
						</div>
					</div>
				</section>

				<StatusMessage :message="rightStatus" :type="rightError ? 'error' : 'success'" />

				<!-- Collapsible settings -->
				<section
					class="yaru-enter yaru-enter-3 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-card)] overflow-hidden divide-y divide-[var(--border-card)]"
				>
					<div>
						<button
							@click="toggleSection('light')"
							class="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
						>
							{{ $t('dashboard.lightSettings') }}
							<ChevronDown
								class="w-4 h-4 transition-transform duration-300"
								:class="openSection === 'light' ? 'rotate-180' : ''"
							/>
						</button>
						<div v-show="openSection === 'light'" class="px-4 pb-4 pt-1 space-y-3">
							<BaseSelect
								v-model="lighting.mode"
								:options="lightModes"
								@update:model-value="scheduleLightingApply"
							/>
							<div v-if="lighting.mode === 'static'">
								<p class="text-xs text-[var(--text-muted)] leading-relaxed">
									{{ $t('lighting.staticNote') }}
								</p>
							</div>
							<div v-if="lighting.mode === 'breathing'" class="space-y-2">
								<div class="flex items-center gap-1.5">
									<span
										v-for="c in BREATHING_PALETTE"
										:key="c"
										class="w-6 h-6 rounded-full outline outline-1 outline-white/10"
										:style="{ background: c }"
									/>
								</div>
								<p class="text-xs text-[var(--text-muted)] leading-relaxed">
									{{ $t('lighting.fixedPaletteNote') }}
								</p>
							</div>
							<div v-if="lighting.mode !== 'off'">
								<div class="text-xs text-[var(--text-muted)] mb-1">
									{{ $t('lighting.brightness') }} ({{ lighting.brightness }})
								</div>
								<BaseSlider
									v-model="lighting.brightness"
									:min="0"
									:max="4"
									:step="1"
									@update:model-value="scheduleLightingApply"
								/>
							</div>
							<div v-if="lighting.mode === 'breathing'">
								<div class="text-xs text-[var(--text-muted)] mb-1">
									{{ $t('lighting.speed') }} ({{ lighting.speed }})
								</div>
								<BaseSlider
									v-model="lighting.speed"
									:min="0"
									:max="4"
									:step="1"
									@update:model-value="scheduleLightingApply"
								/>
							</div>
						</div>
					</div>

					<div>
						<button
							@click="toggleSection('colors')"
							class="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
						>
							{{ $t('dashboard.stageColors') }}
							<ChevronDown
								class="w-4 h-4 transition-transform duration-300"
								:class="openSection === 'colors' ? 'rotate-180' : ''"
							/>
						</button>
						<div v-show="openSection === 'colors'" class="px-4 pb-4 pt-1 space-y-2">
							<p class="text-xs text-[var(--text-muted)] leading-relaxed">
								{{ $t('lighting.colorsHint') }}
							</p>
							<div v-for="i in 6" :key="i" class="flex items-center gap-1.5">
								<span class="text-xs text-[var(--text-muted)] w-6 tabular-nums">D{{ i }}</span>
								<button
									v-for="c in LED_COLORS"
									:key="c"
									@click="setStageColor(i - 1, c)"
									:aria-label="c"
									:title="c"
									class="w-6 h-6 rounded-md transition-transform hover:scale-110"
									:class="
										(lighting.colors[i - 1] ?? '').toLowerCase() === c
											? 'outline outline-2 outline-[#E95420]'
											: 'outline outline-1 outline-white/10'
									"
									:style="{ background: c }"
								/>
							</div>
							<div class="flex items-center gap-1.5 pt-1">
								<span class="text-xs text-[var(--text-muted)] w-6 tabular-nums">All</span>
								<button
									v-for="c in LED_COLORS"
									:key="c"
									@click="
										allStageColor = c;
										applyAllStageColors();
									"
									:aria-label="c"
									:title="c"
									class="w-6 h-6 rounded-md transition-transform hover:scale-110"
									:class="
										allStageColor.toLowerCase() === c
											? 'outline outline-2 outline-[#E95420]'
											: 'outline outline-1 outline-white/10'
									"
									:style="{ background: c }"
								/>
							</div>
							<BaseButton
								@click="applyStageColors(true)"
								:disabled="!isConnected || applyingColors"
								variant="green"
								class="w-full"
							>
								{{ applyingColors ? $t('lighting.applyingColors') : $t('dashboard.apply') }}
							</BaseButton>
						</div>
					</div>

					<div>
						<button
							@click="toggleSection('polling')"
							class="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
						>
							{{ $t('dashboard.pollingSettings') }}
							<ChevronDown
								class="w-4 h-4 transition-transform duration-300"
								:class="openSection === 'polling' ? 'rotate-180' : ''"
							/>
						</button>
						<div v-show="openSection === 'polling'" class="px-4 pb-4 pt-1">
							<BaseSelect
								v-model="pollingRate"
								:options="POLLING_OPTIONS"
								@update:model-value="() => applyPolling(true)"
							/>
						</div>
					</div>

					<div>
						<button
							@click="toggleSection('sleep')"
							class="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
						>
							{{ $t('dashboard.sleepSettings') }}
							<ChevronDown
								class="w-4 h-4 transition-transform duration-300"
								:class="openSection === 'sleep' ? 'rotate-180' : ''"
							/>
						</button>
						<div v-show="openSection === 'sleep'" class="px-4 pb-4 pt-1">
							<BaseSelect
								v-model="sleepMinutes"
								:options="SLEEP_OPTIONS"
								@update:model-value="() => applySleep(true)"
							/>
						</div>
					</div>

					<div>
						<button
							@click="toggleSection('sync')"
							class="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"
						>
							{{ $t('dashboard.syncSettings') }}
							<ChevronDown
								class="w-4 h-4 transition-transform duration-300"
								:class="openSection === 'sync' ? 'rotate-180' : ''"
							/>
						</button>
						<div v-show="openSection === 'sync'" class="px-4 pb-4 pt-1 space-y-1">
							<p class="text-xs text-[var(--text-muted)] leading-relaxed pb-2">
								{{ $t('connection.separateProfiles') }}
							</p>
							<BaseToggle
								v-model="autoSync"
								:label="$t('connection.autoSync')"
								@update:model-value="persistAutoSync"
							/>
							<div class="pt-3">
								<button
									@click="syncCurrentSettings"
									:disabled="!isConnected || syncingMode"
									class="w-full flex items-center justify-center gap-2 rounded-xl bg-[#E95420]/15 hover:bg-[#E95420]/25 active:bg-[#E95420]/30 px-3 py-2 text-[13px] font-medium text-[#f9a88a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
								>
									<ArrowLeftRight class="w-3.5 h-3.5 flex-shrink-0" />
									<span class="truncate">{{
										syncingMode ? $t('connection.syncing') : $t('connection.syncSettings')
									}}</span>
								</button>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>

		<!-- Floating button-remap menu (fixed position: never shifts layout) -->
		<button
			v-if="expandedButton !== null"
			@click="closeButtonMenu"
			class="fixed inset-0 z-20 cursor-default"
			aria-label="Close menu"
			tabindex="-1"
		/>
		<div
			v-if="expandedButton !== null"
			class="fixed z-30 bg-[var(--bg-card)] border border-white/10 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden ring-1 ring-black"
			:style="{ top: menuAnchor.top + 'px', left: menuAnchor.left + 'px', width: menuAnchor.width + 'px' }"
		>
			<div class="px-4 py-2.5 border-b border-[var(--border-card)] bg-[#E95420]/10 flex items-center gap-2.5">
				<span
					class="w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold bg-[#E95420] text-white flex-shrink-0"
				>
					{{ expandedButton + 1 }}
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm font-semibold text-[#f9a88a]">{{
						BUTTON_NAMES[expandedButton]
					}}</span>
					<span class="block truncate text-xs text-[var(--text-muted)]">{{
						presetLabel(buttonPresets[expandedButton] ?? 'default')
					}}</span>
				</span>
			</div>
			<div class="py-1.5 px-1.5">
				<template v-for="(group, gi) in PRESET_GROUPS" :key="group.label ?? 'default'">
					<template v-if="group.label">
						<div
							class="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]"
						>
							{{ group.label }}
						</div>
						<div class="grid grid-cols-2 gap-x-1">
							<button
								v-for="value in group.items"
								:key="value"
								@click="selectPreset(expandedButton, value)"
								:class="[
									'flex items-center gap-1.5 pl-2.5 pr-2 py-[7px] text-[13px] rounded-lg transition-colors',
									buttonPresets[expandedButton] === value
										? 'text-[#E95420] bg-[#E95420]/10 font-medium'
										: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
								]"
							>
								<span class="flex-1 text-left truncate">{{ presetLabel(value) }}</span>
								<Check v-if="buttonPresets[expandedButton] === value" class="w-4 h-4 flex-shrink-0" />
							</button>
						</div>
					</template>
					<template v-else>
						<button
							v-for="value in group.items"
							:key="value"
							@click="selectPreset(expandedButton, value)"
							:class="[
								'w-full flex items-center gap-2 px-2.5 py-[7px] text-[13px] rounded-lg transition-colors',
								buttonPresets[expandedButton] === value
									? 'text-[#E95420] bg-[#E95420]/10 font-medium'
									: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
							]"
						>
							<span class="flex-1 text-left truncate">{{ presetLabel(value) }}</span>
							<Check v-if="buttonPresets[expandedButton] === value" class="w-4 h-4 flex-shrink-0" />
						</button>
					</template>
					<div v-if="gi === 0" class="mx-2 my-1.5 border-t border-[var(--border-card)]" />
				</template>
			</div>
			<div
				v-if="(buttonPresets[expandedButton] ?? 'default') === 'custom'"
				class="px-4 py-2 border-t border-[var(--border-card)] text-[11px] text-[var(--text-muted)]"
			>
				{{ $t('buttons.customKept') }}
			</div>
		</div>
	</div>
</template>
