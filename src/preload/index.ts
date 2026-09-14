import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings } from '../main/storage/settingsManager.js';

// Custom APIs for renderer
export const api = {
	detectDevice: (): Promise<{ detected: boolean; node?: string }> => ipcRenderer.invoke('detect-device'),
	connectDevice: (params?: { model?: string }): Promise<{ success: boolean; error?: string }> =>
		ipcRenderer.invoke('connect-device', params),
	getBattery: (): Promise<number> => ipcRenderer.invoke('get-battery'),
	setDpi: (config: unknown): Promise<number> => ipcRenderer.invoke('set-dpi', config),
	setRgb: (config: unknown): Promise<number> => ipcRenderer.invoke('set-rgb', config),
	setDpiColors: (config: unknown): Promise<number> => ipcRenderer.invoke('set-dpi-colors', config),
	setPollingRate: (rate: number): Promise<number> => ipcRenderer.invoke('set-polling-rate', rate),
	getPollingRate: (): Promise<number | null> => ipcRenderer.invoke('get-polling-rate'),
	setSleep: (minutes: number): Promise<number> => ipcRenderer.invoke('set-sleep', minutes),
	getSensor: (): Promise<unknown> => ipcRenderer.invoke('get-sensor'),
	getButtons: (): Promise<string[]> => ipcRenderer.invoke('get-buttons'),
	setButtons: (presets: unknown): Promise<number> => ipcRenderer.invoke('set-buttons', presets),
	getDpiTable: (): Promise<unknown> => ipcRenderer.invoke('get-dpi-table'),
	getLedEffect: (): Promise<unknown> => ipcRenderer.invoke('get-led-effect'),
	getStageColors: (): Promise<unknown> => ipcRenderer.invoke('get-stage-colors'),
	resetDevice: (): Promise<{ success: boolean }> => ipcRenderer.invoke('reset-device'),
	listProfiles: (): Promise<string[]> => ipcRenderer.invoke('list-profiles'),
	saveProfile: (name: string, data: unknown): Promise<void> => ipcRenderer.invoke('save-profile', name, data),
	loadProfile: (name: string): Promise<unknown> => ipcRenderer.invoke('load-profile', name),
	deleteProfile: (name: string): Promise<void> => ipcRenderer.invoke('delete-profile', name),
	getSettings: (): Promise<AppSettings | null> => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('save-settings', settings),
	getDeviceInfo: (): Promise<unknown> => ipcRenderer.invoke('get-device-info'),
	getDeviceModel: (): Promise<'AJ159P' | 'AJ159Pro'> => ipcRenderer.invoke('get-device-model'),
	getDeviceCapabilities: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('get-device-capabilities'),
	onBatteryUpdated: (callback: (level: number) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, value: number): void => callback(value);
		ipcRenderer.on('battery-updated', handler);
		return () => ipcRenderer.removeListener('battery-updated', handler);
	},
};

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld('api', api);
	} catch (error) {
		console.error('[preload] contextBridge error:', error);
	}
} else {
	window.api = api;
}
