/// <reference types="vite/client" />

declare module '@vue/runtime-core' {
	interface ComponentCustomProperties {
		$t: (key: string, ...args: unknown[]) => string;
	}
}

interface AppSettings {
	lastTab: string;
	deviceModel: 'AJ159P' | 'AJ159Pro';
	language: string;
	pollingRate: number;
	sleepMinutes: number;
	dpi: {
		selected: number;
		values: [number, number, number, number, number, number];
	};
	rgb: {
		mode: 'off' | 'static' | 'breathing';
		color: string;
		brightness: number;
		speed: number;
		colors: [string, string, string, string, string, string];
	};
}

declare global {
	interface Window {
		api: {
			detectDevice: () => Promise<{ detected: boolean; node?: string }>;
			connectDevice: (params?: { model?: string }) => Promise<{ success: boolean; error?: string }>;
			getBattery: () => Promise<number>;
			setDpi: (config: unknown) => Promise<number>;
			setRgb: (config: unknown) => Promise<number>;
			setDpiColors: (config: unknown) => Promise<number>;
			setPollingRate: (rate: number) => Promise<number>;
			getPollingRate: () => Promise<number | null>;
			setSleep: (minutes: number) => Promise<number>;
			getSensor: () => Promise<unknown>;
			getButtons: () => Promise<string[]>;
			setButtons: (presets: unknown) => Promise<number>;
			getDpiTable: () => Promise<unknown>;
			getLedEffect: () => Promise<unknown>;
			getStageColors: () => Promise<unknown>;
			resetDevice: () => Promise<{ success: boolean }>;
			listProfiles: () => Promise<string[]>;
			saveProfile: (name: string, data: unknown) => Promise<void>;
			loadProfile: (name: string) => Promise<unknown>;
			deleteProfile: (name: string) => Promise<void>;
			getSettings: () => Promise<AppSettings | null>;
			saveSettings: (settings: AppSettings) => Promise<void>;
			getDeviceInfo: () => Promise<unknown>;
			getDeviceModel: () => Promise<'AJ159P' | 'AJ159Pro'>;
			getDeviceCapabilities: () => Promise<Record<string, boolean>>;
			onBatteryUpdated: (callback: (level: number) => void) => () => void;
		};
	}
}

export {};
