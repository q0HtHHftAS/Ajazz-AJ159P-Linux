import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { autoUpdater } from 'electron-updater';
import { AjazzAJ159P } from './driver/index.js';
import type { ConnectionKind, DeviceModel, RgbMode } from './driver/types.js';
import { DPI_MAX, DPI_MIN, DPI_STEP, type DpiBuilderOptions } from './driver/protocols/DpiBuilder.js';
import type { RgbBuilderOptions } from './driver/protocols/RgbBuilder.js';
import { KeyTableBuilder, KEY_SLOT_COUNT, type ButtonPresetId } from './driver/protocols/KeyTableBuilder.js';
import type { PollingRate } from './driver/protocols/PollingRateBuilder.js';
import { SLEEP_PRESETS_MINUTES } from './driver/protocols/SensorBuilder.js';
import * as profileManager from './storage/profileManager.js';
import * as settingsManager from './storage/settingsManager.js';

let driver: AjazzAJ159P | null = null;
let deviceModel: DeviceModel = 'AJ159P';
let connectionKind: ConnectionKind = 'wireless';

function createWindow(): void {
	// Force dark decorations so the native title bar is black per Yaru-dark theme,
	// not white (light Adwaita). Must be set before window creation.
	nativeTheme.themeSource = 'dark';
	// Create the browser window.
	const mainWindow = new BrowserWindow({
		width: 1366,
		height: 864,
		minWidth: 1152,
		minHeight: 768,
		resizable: true,
		maximizable: true,
		fullscreenable: false,
		icon: join(__dirname, '../../assets/ajazz-aj159p.png'),
		show: false,
		autoHideMenuBar: true,
		backgroundColor: '#161514',
		darkTheme: true,
		titleBarStyle: 'default',
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false,
		},
	});

	mainWindow.on('ready-to-show', () => {
		mainWindow.show();
	});

	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: 'deny' };
	});

	// HMR for renderer base on electron-vite cli.
	// Load the remote URL for development or the local html file for production.
	if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
		mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
	} else {
		mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
	}
}

function validateDpiConfig(config: unknown): DpiBuilderOptions {
	if (typeof config !== 'object' || config === null) throw new Error('Invalid DPI configuration: must be an object');
	const obj = config as Record<string, unknown>;
	const validated: DpiBuilderOptions = {};
	if (obj['selected'] !== undefined) {
		const selected = obj['selected'] as number;
		if (!Number.isInteger(selected) || selected < 1 || selected > 6) {
			throw new Error('Invalid selected: must be an integer between 1 and 6');
		}
		validated.selected = selected;
	}
	if (obj['values'] !== undefined) {
		const values = obj['values'];
		if (
			!Array.isArray(values) ||
			values.length !== 6 ||
			!values.every(
				(v) =>
					typeof v === 'number' && Number.isInteger(v) && v >= DPI_MIN && v <= DPI_MAX && v % DPI_STEP === 0,
			)
		) {
			throw new Error(`Invalid values: must be 6 integers ${DPI_MIN}..${DPI_MAX} in steps of ${DPI_STEP}`);
		}
		validated.values = values as [number, number, number, number, number, number];
	}
	return validated;
}

function validateRgbConfig(config: unknown): RgbBuilderOptions {
	if (typeof config !== 'object' || config === null) throw new Error('Invalid RGB configuration: must be an object');
	const obj = config as Record<string, unknown>;
	const validated: RgbBuilderOptions = {};
	if (obj['mode'] !== undefined) {
		const mode = obj['mode'] as string;
		if (mode !== 'off' && mode !== 'static' && mode !== 'breathing') {
			throw new Error('Invalid mode: must be off, static, or breathing');
		}
		validated.mode = mode as RgbMode;
	}
	if (obj['color'] !== undefined) {
		const color = obj['color'] as string;
		if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
			throw new Error('Invalid color: must be #RRGGBB');
		}
		validated.color = color;
	}
	for (const key of ['brightness', 'speed'] as const) {
		if (obj[key] !== undefined) {
			const value = obj[key] as number;
			if (!Number.isInteger(value) || value < 0 || value > 4) {
				throw new Error(`Invalid ${key}: must be an integer between 0 and 4`);
			}
			validated[key] = value;
		}
	}
	return validated;
}

// App lifecycle
app.whenReady().then(() => {
	// Set app user model id for windows
	electronApp.setAppUserModelId('com.ajazz.aj159p');

	// Default open or close DevTools by F12 in development
	// and ignore CommandOrControl + R in production.
	// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
	app.on('browser-window-created', (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	// --- Auto-update (production only; dev builds have no update metadata) ---
	const broadcastUpdate = (payload: {
		status: string;
		percent?: number;
		version?: string;
		message?: string;
	}): void => {
		BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('update-status', payload));
	};

	if (app.isPackaged) {
		autoUpdater.autoDownload = true;
		autoUpdater.on('checking-for-update', () => {
			broadcastUpdate({ status: 'checking' });
		});
		autoUpdater.on('update-available', (info) => {
			broadcastUpdate({ status: 'available', version: info.version });
		});
		autoUpdater.on('download-progress', (progress) => {
			broadcastUpdate({ status: 'progress', percent: Math.round(progress.percent) });
		});
		autoUpdater.on('update-downloaded', (info) => {
			broadcastUpdate({ status: 'downloaded', version: info.version });
		});
		autoUpdater.on('update-not-available', () => {
			broadcastUpdate({ status: 'none' });
		});
		autoUpdater.on('error', (err: Error) => {
			broadcastUpdate({ status: 'error', message: err.message });
		});
		// Delay slightly so the window is up before the silent check runs.
		setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 5000);
	}

	ipcMain.handle('check-for-updates', async () => {
		if (!app.isPackaged) return { success: false, error: 'Updates are only available in packaged builds' };
		try {
			const result = await autoUpdater.checkForUpdates();
			return { success: true, version: result?.updateInfo.version };
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return { success: false, error: err.message };
		}
	});

	ipcMain.handle('quit-and-install', () => {
		autoUpdater.quitAndInstall(false, true);
	});

	// IPC Handlers
	ipcMain.handle('detect-device', () => AjazzAJ159P.detectDevice());

	ipcMain.handle('detect-devices', () => AjazzAJ159P.detectDevices());

	ipcMain.handle('disconnect-device', async () => {
		if (driver) {
			const closing = driver;
			driver = null;
			try {
				await closing.close();
			} catch (err) {
				console.error('Error during driver disconnect:', err);
			}
		}
		return { success: true };
	});

	ipcMain.handle('connect-device', async (_, params?: { model?: DeviceModel; kind?: ConnectionKind }) => {
		try {
			const model: DeviceModel = params?.model === 'AJ159Pro' ? 'AJ159Pro' : 'AJ159P';
			const kind: ConnectionKind = params?.kind === 'wired' ? 'wired' : 'wireless';
			const found = AjazzAJ159P.detectDevices().find((r) => r.kind === kind) ?? AjazzAJ159P.detectDevices()[0];
			if (!found) {
				return { success: false, error: 'No AJ159P receiver or USB cable detected' };
			}
			const oldDriver = driver;
			const newDriver = new AjazzAJ159P({ deviceModel: model, connectionKind: found.kind });
			await newDriver.open(found.node);

			newDriver.on('batteryChange', (level) => {
				const windows = BrowserWindow.getAllWindows();
				windows.forEach((w) => w.webContents.send('battery-updated', level));
			});

			if (oldDriver) {
				await oldDriver.close();
			}

			// eslint-disable-next-line require-atomic-updates
			driver = newDriver;
			deviceModel = model;
			connectionKind = found.kind;
			return { success: true, kind: found.kind };
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('Connection failed:', err);
			return { success: false, error: err.message };
		}
	});

	ipcMain.handle('get-battery', async () => {
		if (!driver) return -1;
		// Wired USB mode has no battery — skip the device-info query entirely.
		if (connectionKind === 'wired') return -1;
		try {
			const level = await driver.getBatteryLevel();
			return level;
		} catch (err) {
			console.error('Failed to get battery:', err);
			return -1;
		}
	});

	ipcMain.handle('set-dpi', async (_, config: unknown) => {
		if (!driver) throw new Error('Device not connected');
		const validated = validateDpiConfig(config);
		const result = await driver.setDpi(validated);

		// Persist DPI config
		const settings = await settingsManager.getSettings();
		const values = validated.values ?? settings.dpi.values;
		const selected = validated.selected ?? settings.dpi.selected;
		await settingsManager.saveSettings({ ...settings, dpi: { selected, values } });

		return result;
	});

	ipcMain.handle('set-rgb', async (_, config: unknown) => {
		if (!driver) throw new Error('Device not connected');
		const validated = validateRgbConfig(config);
		const result = await driver.setRgb(validated);

		// Persist lighting config
		const settings = await settingsManager.getSettings();
		await settingsManager.saveSettings({
			...settings,
			rgb: {
				mode: validated.mode ?? settings.rgb.mode,
				color: validated.color ?? settings.rgb.color,
				brightness: validated.brightness ?? settings.rgb.brightness,
				speed: validated.speed ?? settings.rgb.speed,
				colors: settings.rgb.colors,
			},
		});

		return result;
	});

	ipcMain.handle('set-dpi-colors', async (_, config: unknown) => {
		if (!driver) throw new Error('Device not connected');
		if (
			typeof config !== 'object' ||
			config === null ||
			!Array.isArray((config as Record<string, unknown>)['colors'])
		) {
			throw new Error('Invalid DPI colours: must be { colors: [6 x #RRGGBB] }');
		}
		const colors = (config as { colors: unknown }).colors;
		if (
			!Array.isArray(colors) ||
			colors.length !== 6 ||
			!colors.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
		) {
			throw new Error('Invalid colors: must be an array of 6 #RRGGBB strings');
		}
		const result = await driver.setDpiColors({
			colors: colors as [string, string, string, string, string, string],
		});

		// Persist stage colours
		const settings = await settingsManager.getSettings();
		await settingsManager.saveSettings({
			...settings,
			rgb: { ...settings.rgb, colors: colors as [string, string, string, string, string, string] },
		});

		return result;
	});

	ipcMain.handle('get-device-info', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getDeviceInfo();
	});

	ipcMain.handle('set-polling-rate', async (_, rate: unknown) => {
		if (!driver) throw new Error('Device not connected');
		if (rate !== 125 && rate !== 250 && rate !== 500 && rate !== 1000) {
			throw new Error('Invalid rate: must be one of 125, 250, 500, 1000');
		}
		const result = await driver.setPollingRate(rate as PollingRate);

		const settings = await settingsManager.getSettings();
		await settingsManager.saveSettings({ ...settings, pollingRate: rate });

		return result;
	});

	ipcMain.handle('get-polling-rate', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getPollingRate();
	});

	ipcMain.handle('set-sleep', async (_, minutes: unknown) => {
		if (!driver) throw new Error('Device not connected');
		if (typeof minutes !== 'number' || !(SLEEP_PRESETS_MINUTES as readonly number[]).includes(minutes)) {
			throw new Error('Invalid sleep time: must be one of the offered presets');
		}
		const result = await driver.setSleepMinutes(minutes);

		const settings = await settingsManager.getSettings();
		await settingsManager.saveSettings({ ...settings, sleepMinutes: minutes });

		return result;
	});

	ipcMain.handle('get-sensor', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getSensorSettings();
	});

	ipcMain.handle('get-buttons', () => {
		if (!driver) throw new Error('Device not connected');
		return driver
			.getKeySlots()
			.then((slots) => slots.map(([marker, lo, hi], slot) => KeyTableBuilder.matchPreset(slot, marker, lo, hi)));
	});

	ipcMain.handle('get-dpi-table', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getDpiTable();
	});

	ipcMain.handle('get-led-effect', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getLedEffect();
	});

	ipcMain.handle('get-stage-colors', () => {
		if (!driver) throw new Error('Device not connected');
		return driver.getStageColors();
	});

	ipcMain.handle('set-buttons', (_, presets: unknown) => {
		if (!driver) throw new Error('Device not connected');
		if (!Array.isArray(presets) || presets.length !== KEY_SLOT_COUNT) {
			throw new Error(`Invalid presets: must be an array of ${KEY_SLOT_COUNT} preset IDs`);
		}
		return driver.setKeySlots(presets as (ButtonPresetId | 'default' | 'custom')[]);
	});

	ipcMain.handle('reset-device', async () => {
		if (!driver) throw new Error('Device not connected');
		await driver.reset();
		return { success: true };
	});

	ipcMain.handle('get-device-model', () => deviceModel);

	ipcMain.handle('get-connection-kind', () => connectionKind);

	ipcMain.handle('get-device-capabilities', () => ({
		dpi: true,
		rgb: true,
		battery: true,
		pollingRate: true,
		buttonRemap: true,
		sleepSettings: true,
		// Not available on the 249a:5c2f protocol:
		macros: false,
		keyResponse: false,
	}));

	ipcMain.handle('list-profiles', () => profileManager.listProfiles());
	ipcMain.handle('save-profile', (_, name: string, data: unknown) => profileManager.saveProfile(name, data));
	ipcMain.handle('load-profile', (_, name: string) => profileManager.loadProfile(name));
	ipcMain.handle('delete-profile', (_, name: string) => profileManager.deleteProfile(name));

	ipcMain.handle('get-settings', () => settingsManager.getSettings());
	ipcMain.handle('save-settings', (_, settings) => settingsManager.saveSettings(settings));

	createWindow();

	app.on('activate', function () {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});

	// Ensure driver is closed when app quits
	let isQuitting = false;
	app.on('before-quit', async (e) => {
		if (driver && !isQuitting) {
			e.preventDefault();
			isQuitting = true;
			const driverToClose = driver;
			driver = null;
			try {
				await driverToClose.close();
			} catch (err) {
				console.error('Error during driver cleanup:', err);
			}
			app.quit();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
