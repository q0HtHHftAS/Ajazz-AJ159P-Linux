import { describe, expect, it, vi, beforeEach } from 'bun:test';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('electron', () => ({
	app: {
		getPath: vi.fn(() => '/tmp/test-user-data'),
	},
}));

vi.mock('fs/promises', () => ({
	default: {
		readFile: mockReadFile,
		writeFile: mockWriteFile,
	},
	readFile: mockReadFile,
	writeFile: mockWriteFile,
}));

const { getSettings, saveSettings } = await import('../src/main/storage/settingsManager.js');
const SETTINGS_PATH = '/tmp/test-user-data/settings.json';

const DEFAULT_SETTINGS = {
	lastTab: 'dpi',
	deviceModel: 'AJ159P',
	language: 'en',
	pollingRate: 1000,
	sleepMinutes: 5,
	autoSync: true,
	buttons: ['default', 'default', 'default', 'default', 'default'],
	dpi: {
		selected: 2,
		values: [1600, 3200, 4800, 6400, 12800, 23200],
	},
	rgb: {
		mode: 'static',
		color: '#8b5cf6',
		brightness: 4,
		speed: 2,
		colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'],
	},
};

describe('settingsManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getSettings', () => {
		it('should return defaults when file does not exist', async () => {
			mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
			const settings = await getSettings();
			expect(settings).toEqual(DEFAULT_SETTINGS);
		});

		it('should return defaults when JSON is corrupted', async () => {
			mockReadFile.mockResolvedValue('not valid json {{{');
			const settings = await getSettings();
			expect(settings).toEqual(DEFAULT_SETTINGS);
		});

		it('should merge saved settings over defaults', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					lastTab: 'lighting',
					language: 'th',
					dpi: { selected: 3 },
				}),
			);
			const settings = await getSettings();
			expect(settings.lastTab).toBe('lighting');
			expect(settings.language).toBe('th');
			expect(settings.dpi.selected).toBe(3);
			expect(settings.dpi.values).toEqual(DEFAULT_SETTINGS.dpi.values);
		});

		it('should coerce numeric dpi values to numbers', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					dpi: { selected: '2', values: ['400', 'invalid', 1600, 3200, 6400, 26000] },
				}),
			);
			const settings = await getSettings();
			expect(settings.dpi.selected).toBe(2);
			expect(settings.dpi.values[0]).toBe(400);
			expect(settings.dpi.values[1]).toBe(3200);
			expect(settings.dpi.values[5]).toBe(26000);
		});

		it('should pad short dpi value arrays with defaults', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ dpi: { values: [100, 200] } }));
			const settings = await getSettings();
			expect(settings.dpi.values).toHaveLength(6);
			expect(settings.dpi.values[0]).toBe(100);
			expect(settings.dpi.values[2]).toBe(DEFAULT_SETTINGS.dpi.values[2]);
		});

		it('should fix deviceModel: AJ159Pro stays, everything else becomes AJ159P', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ deviceModel: 'AJ159Pro' }));
			let settings = await getSettings();
			expect(settings.deviceModel).toBe('AJ159Pro');

			mockReadFile.mockResolvedValue(JSON.stringify({ deviceModel: 'X11' }));
			settings = await getSettings();
			expect(settings.deviceModel).toBe('AJ159P');
		});

		it('should fall back for invalid rgb mode and colours', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					rgb: { mode: 'rainbow', color: 'red', brightness: '3' },
				}),
			);
			const settings = await getSettings();
			expect(settings.rgb.mode).toBe(DEFAULT_SETTINGS.rgb.mode);
			expect(settings.rgb.color).toBe(DEFAULT_SETTINGS.rgb.color);
			expect(settings.rgb.brightness).toBe(3);
		});

		it('should keep a saved autoSync=false, defaulting to true otherwise', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ autoSync: false }));
			expect((await getSettings()).autoSync).toBe(false);

			mockReadFile.mockResolvedValue(JSON.stringify({ autoSync: 'yes' }));
			expect((await getSettings()).autoSync).toBe(true);
		});

		it('should validate button presets and pad with defaults', async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ buttons: ['left', 'bogus', 'copy', 'custom'] }));
			const settings = await getSettings();
			expect(settings.buttons).toEqual(['left', 'default', 'copy', 'custom', 'default']);
		});
	});

	describe('saveSettings', () => {
		it('should write settings to file with pretty JSON', async () => {
			await saveSettings(DEFAULT_SETTINGS);
			expect(mockWriteFile).toHaveBeenCalledWith(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
		});
	});
});
