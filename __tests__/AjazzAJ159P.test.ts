import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { AjazzAJ159P } from '../src/main/driver/core/AjazzAJ159P.js';
import { DriverError, type HidrawHandle, type Logger } from '../src/main/driver/index.js';

const silentLogger: Logger = {
	debug: (): void => {},
	info: (): void => {},
	warn: (): void => {},
	error: (): void => {},
};

function createFakeHandle(): HidrawHandle & { writes: Buffer[]; nextRead: (Buffer | null)[] } {
	const state = {
		writes: [] as Buffer[],
		nextRead: [] as (Buffer | null)[],
	};
	return {
		writes: state.writes,
		nextRead: state.nextRead,
		write: (data: Buffer): void => {
			state.writes.push(Buffer.from(data));
		},
		read: (): Buffer | null => state.nextRead.shift() ?? null,
		close: (): void => {},
	};
}

describe('AjazzAJ159P', () => {
	let handle: ReturnType<typeof createFakeHandle>;
	let driver: AjazzAJ159P;

	beforeEach(() => {
		handle = createFakeHandle();
		driver = new AjazzAJ159P({
			deviceModel: 'AJ159P',
			logger: silentLogger,
			transport: { node: '/dev/hidraw9', handle },
		});
	});

	describe('open() / close()', () => {
		it('guards commands before open', () => {
			expect(() => driver.checkIsOpen()).toThrow(DriverError);
		});

		it('opens and closes with the injected transport', async () => {
			await driver.open();
			expect(driver.hidrawNode).toBe('/dev/hidraw9');
			await driver.close();
			expect(() => driver.checkIsOpen()).toThrow(DriverError);
		});
	});

	describe('setDpi()', () => {
		it('writes the factory-default golden report', async () => {
			await driver.open();
			await driver.setDpi({ selected: 2, values: [1600, 3200, 4800, 6400, 12800, 23200] });
			expect(handle.writes).toHaveLength(1);
			expect(handle.writes[0]?.toString('hex')).toBe(
				'0003000125161000100020002000300030004000400080008000e800e800000026',
			);
			await driver.close();
		});
	});

	describe('setRgb()', () => {
		it('writes the static-red golden report', async () => {
			await driver.open();
			await driver.setRgb({ mode: 'static', color: '#ff0000', brightness: 4, speed: 2 });
			expect(handle.writes).toHaveLength(1);
			expect(handle.writes[0]?.toString('hex')).toBe(
				'00050001050342ff00000000000000000000000000000000000000000000000044',
			);
			await driver.close();
		});
	});

	describe('setDpiColors()', () => {
		it('writes the all-white golden report', async () => {
			await driver.open();
			const white = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] as [
				string,
				string,
				string,
				string,
				string,
				string,
			];
			await driver.setDpiColors({ colors: white });
			expect(handle.writes).toHaveLength(1);
			expect(handle.writes[0]?.toString('hex')).toBe(
				'0004000112ffffffffffffffffffffffffffffffffffff000000000000000000ee',
			);
			await driver.close();
		});
	});

	describe('getDeviceInfo()', () => {
		it('reports VID/PID and node', async () => {
			await driver.open();
			const info = driver.getDeviceInfo();
			expect(info.vendorId).toBe('0x249a');
			expect(info.productId).toBe('0x5c2f');
			expect(info.hidrawNode).toBe('/dev/hidraw9');
			await driver.close();
		});

		it('reports wired USB IDs and mode for a wired connection', async () => {
			const wiredHandle = createFakeHandle();
			const wired = new AjazzAJ159P({
				deviceModel: 'AJ159P',
				connectionKind: 'wired',
				logger: silentLogger,
				transport: { node: '/dev/hidraw9', handle: wiredHandle },
			});
			await wired.open();
			const info = wired.getDeviceInfo();
			expect(info.vendorId).toBe('0x248a');
			expect(info.productId).toBe('0x5c2e');
			expect(info.connectionMode).toBe('Wired (USB)');
			await wired.close();
		});
	});

	describe('onBatteryChange()', () => {
		it('forwards battery frames as events', async () => {
			vi.useFakeTimers();
			try {
				handle.nextRead.push(Buffer.from([0xc0, 0x01, 77]));
				await driver.open();
				const levels: number[] = [];
				const unsubscribe = driver.onBatteryChange((level) => levels.push(level));
				vi.advanceTimersByTime(600);
				expect(levels).toEqual([77]);
				unsubscribe();
				await driver.close();
			} finally {
				vi.useRealTimers();
			}
		});

		it('getBatteryLevel queries device info and emits the reading', async () => {
			await driver.open();
			const levels: number[] = [];
			const unsubscribe = driver.onBatteryChange((level) => levels.push(level));
			// queryReport runs through an async queue (drain happens after
			// this tick), so queue the reply once the query goes out.
			const pending = driver.getBatteryLevel(1000);
			await new Promise((r) => setTimeout(r, 0));
			handle.nextRead.push(
				Buffer.from('1000010b4d36323084019501006001000000000000000000000000000000000061', 'hex'),
			);
			await expect(pending).resolves.toBe(96);
			expect(levels).toEqual([96]);
			unsubscribe();
			await driver.close();
		});

		it('getBatteryLevel returns -1 immediately in wired mode without querying', async () => {
			const wiredHandle = createFakeHandle();
			const wired = new AjazzAJ159P({
				deviceModel: 'AJ159P',
				connectionKind: 'wired',
				logger: silentLogger,
				transport: { node: '/dev/hidraw9', handle: wiredHandle },
			});
			await wired.open();
			await expect(wired.getBatteryLevel(1000)).resolves.toBe(-1);
			expect(wiredHandle.writes).toHaveLength(0);
			await wired.close();
		});
	});
});
