import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { BatteryMonitor, parseBatteryFrame } from '../src/main/driver/core/BatteryMonitor.js';
import type { Logger } from '../src/main/driver/index.js';

const silentLogger: Logger = {
	debug: (): void => {},
	info: (): void => {},
	warn: (): void => {},
	error: (): void => {},
};

describe('parseBatteryFrame', () => {
	it('extracts the percentage from C0 frames', () => {
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x01, 87, 0x00]))).toBe(87);
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x01, 100]))).toBe(100);
	});

	it('ignores non-battery frames', () => {
		expect(parseBatteryFrame(Buffer.from([0x00, 0x05, 0x00]))).toBeNull();
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x01]))).toBeNull();
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x01, 101]))).toBeNull();
	});

	it('ignores C0 00 command-reply frames', () => {
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x00, 0x00]))).toBeNull();
		expect(parseBatteryFrame(Buffer.from([0xc0, 0x00, 50]))).toBeNull();
	});
});

describe('BatteryMonitor', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	describe('startPolling()', () => {
		it('emits batteryChange when a battery frame arrives', () => {
			vi.useFakeTimers();
			try {
				const monitor = new BatteryMonitor(
					() => Buffer.from([0xc0, 0x01, 64]),
					silentLogger,
					() => true,
				);
				const levels: number[] = [];
				monitor.on('batteryChange', (level) => levels.push(level));
				monitor.startPolling(100);
				vi.advanceTimersByTime(150);
				expect(levels).toEqual([64]);
				monitor.destroy();
			} finally {
				vi.useRealTimers();
			}
		});

		it('does not emit for command-reply frames without link byte', () => {
			vi.useFakeTimers();
			try {
				const monitor = new BatteryMonitor(
					() => Buffer.from([0xc0, 0x00, 0x00]),
					silentLogger,
					() => true,
				);
				const levels: number[] = [];
				monitor.on('batteryChange', (level) => levels.push(level));
				monitor.startPolling(100);
				vi.advanceTimersByTime(300);
				expect(levels).toEqual([]);
				monitor.destroy();
			} finally {
				vi.useRealTimers();
			}
		});

		it('does not poll before startPolling', () => {
			vi.useFakeTimers();
			try {
				let reads = 0;
				const monitor = new BatteryMonitor(
					() => {
						reads += 1;
						return null;
					},
					silentLogger,
					() => true,
				);
				expect(monitor.isPolling).toBe(false);
				vi.advanceTimersByTime(500);
				expect(reads).toBe(0);
				monitor.destroy();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('getBatteryLevel()', () => {
		it('resolves immediately from cache', async () => {
			vi.useFakeTimers();
			try {
				const monitor = new BatteryMonitor(
					() => Buffer.from([0xc0, 0x01, 55]),
					silentLogger,
					() => true,
				);
				monitor.startPolling(10);
				vi.advanceTimersByTime(20);
				await expect(monitor.getBatteryLevel(100)).resolves.toBe(55);
				monitor.destroy();
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
