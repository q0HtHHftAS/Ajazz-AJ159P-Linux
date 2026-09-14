import { app } from 'electron';
import { DEFAULT_DPI_VALUES } from '../driver/protocols/DpiBuilder.js';
import { DEFAULT_DPI_COLORS } from '../driver/protocols/DpiColorBuilder.js';
import type { DeviceModel, RgbMode } from '../driver/types.js';
import fs from 'fs/promises';
import path from 'path';

const getSettingsPath = (): string => path.join(app.getPath('userData'), 'settings.json');

export interface AppSettings {
	lastTab: string;
	deviceModel: DeviceModel;
	language: string;
	pollingRate: number;
	sleepMinutes: number;
	/** Re-apply the file settings to the mouse on connect (diff-write). */
	autoSync: boolean;
	/** Button presets per slot; 'custom' leaves the on-device slot untouched. */
	buttons: [string, string, string, string, string];
	dpi: {
		selected: number;
		values: [number, number, number, number, number, number];
	};
	rgb: {
		mode: RgbMode;
		color: string;
		brightness: number;
		speed: number;
		colors: [string, string, string, string, string, string];
	};
}

const DEFAULT_SETTINGS: AppSettings = {
	lastTab: 'dpi',
	deviceModel: 'AJ159P',
	language: 'en',
	pollingRate: 1000,
	sleepMinutes: 5,
	autoSync: true,
	buttons: ['default', 'default', 'default', 'default', 'default'],
	dpi: {
		selected: 2,
		values: [...DEFAULT_DPI_VALUES] as [number, number, number, number, number, number],
	},
	rgb: {
		mode: 'static',
		color: '#8b5cf6',
		brightness: 4,
		speed: 2,
		colors: [...DEFAULT_DPI_COLORS] as [string, string, string, string, string, string],
	},
};

function toNum(v: unknown, fallback: number): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function toColor(v: unknown, fallback: string): string {
	if (typeof v !== 'string') return fallback;
	const value = v.startsWith('#') ? v.slice(1) : v;
	return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : fallback;
}

const BUTTON_PRESET_IDS = new Set([
	'default',
	'left',
	'right',
	'middle',
	'forward',
	'backward',
	'vol-up',
	'vol-down',
	'mute',
	'play-pause',
	'copy',
	'paste',
	'custom',
]);

function toButtonPreset(v: unknown, fallback: string): string {
	return typeof v === 'string' && BUTTON_PRESET_IDS.has(v) ? v : fallback;
}

export async function getSettings(): Promise<AppSettings> {
	try {
		const data = await fs.readFile(getSettingsPath(), 'utf-8');
		const saved = JSON.parse(data);
		const dpiValues = Array.isArray(saved.dpi?.values) ? saved.dpi.values : [];
		const colors = Array.isArray(saved.rgb?.colors) ? saved.rgb.colors : [];
		return {
			...DEFAULT_SETTINGS,
			...saved,
			deviceModel: saved.deviceModel === 'AJ159Pro' ? 'AJ159Pro' : 'AJ159P',
			pollingRate: [125, 250, 500, 1000].includes(saved.pollingRate)
				? saved.pollingRate
				: DEFAULT_SETTINGS.pollingRate,
			sleepMinutes:
				typeof saved.sleepMinutes === 'number' && Number.isFinite(saved.sleepMinutes)
					? saved.sleepMinutes
					: DEFAULT_SETTINGS.sleepMinutes,
			autoSync: typeof saved.autoSync === 'boolean' ? saved.autoSync : DEFAULT_SETTINGS.autoSync,
			buttons: [0, 1, 2, 3, 4].map((i) =>
				toButtonPreset(
					Array.isArray(saved.buttons) ? saved.buttons[i] : undefined,
					DEFAULT_SETTINGS.buttons[i] ?? 'default',
				),
			) as [string, string, string, string, string],
			dpi: {
				selected: toNum(saved.dpi?.selected, DEFAULT_SETTINGS.dpi.selected),
				values: [0, 1, 2, 3, 4, 5].map((i) => toNum(dpiValues[i], DEFAULT_SETTINGS.dpi.values[i] ?? 800)) as [
					number,
					number,
					number,
					number,
					number,
					number,
				],
			},
			rgb: {
				mode:
					saved.rgb?.mode === 'off' || saved.rgb?.mode === 'static' || saved.rgb?.mode === 'breathing'
						? saved.rgb.mode
						: DEFAULT_SETTINGS.rgb.mode,
				color: toColor(saved.rgb?.color, DEFAULT_SETTINGS.rgb.color),
				brightness: toNum(saved.rgb?.brightness, DEFAULT_SETTINGS.rgb.brightness),
				speed: toNum(saved.rgb?.speed, DEFAULT_SETTINGS.rgb.speed),
				colors: [0, 1, 2, 3, 4, 5].map((i) =>
					toColor(colors[i], DEFAULT_SETTINGS.rgb.colors[i] ?? '#ffffff'),
				) as [string, string, string, string, string, string],
			},
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export async function saveSettings(settings: AppSettings): Promise<void> {
	await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
}
