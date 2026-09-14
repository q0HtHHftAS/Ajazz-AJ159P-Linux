import { EventEmitter } from 'node:events';
import { TimeoutError } from '../errors.js';
import type { HidrawHandle } from './HidrawTransport.js';
import type { Logger } from '../types.js';

export interface BatteryMonitorEvents {
	batteryChange: [battery: number];
	error: [error: Error];
}

/**
 * Parses a raw hidraw frame into a battery percentage.
 *
 * Battery frames start with `0xC0` and carry the percentage at byte 2.
 * The receiver also uses `C0 00` frames as command replies, so a zero with a
 * zero link byte must not be treated as a disconnect.
 *
 * @returns percentage 0..100, or `null` when the frame is not a battery frame.
 */
export function parseBatteryFrame(frame: Buffer): number | null {
	if (frame.length < 3) return null;
	if (frame[0] !== 0xc0) return null;
	// The receiver also uses C0 00 frames as command replies, so only
	// positive-link frames are unambiguous battery readings. Physical dongle
	// removal is detected through device discovery, not through frames.
	if (frame[1] === 0) return null;
	const percent = frame[2] ?? 101;
	if (percent > 100) return null;
	return percent;
}

/**
 * Polls the receiver's vendor interface for battery frames and emits
 * `batteryChange`. Wired mode has no battery (level -1).
 */
export class BatteryMonitor extends EventEmitter<BatteryMonitorEvents> {
	private lastBattery: number = -1;
	private readFrame: () => Buffer | null;
	private logger: Logger;
	private isOpen: () => boolean;
	private onFrame: ((frame: Buffer) => void) | undefined;
	private polling = false;
	get isPolling(): boolean {
		return this.polling;
	}
	private pollTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		readFrame: HidrawHandle['read'],
		logger: Logger,
		isOpen: () => boolean,
		onFrame?: (frame: Buffer) => void,
	) {
		super();
		this.readFrame = readFrame;
		this.logger = logger;
		this.isOpen = isOpen;
		this.onFrame = onFrame;
	}

	getBatteryLevel(timeoutMs: number): Promise<number> {
		return new Promise((resolve, reject) => {
			if (this.lastBattery !== -1 && this.lastBattery <= 100) {
				resolve(this.lastBattery);
				return;
			}

			let finished = false;

			const cleanup = (): void => {
				if (finished) return;
				finished = true;
				clearTimeout(timeout);
				this.removeListener('batteryChange', handleBattery);
			};

			const handleBattery = (battery: number): void => {
				if (finished) return;
				if (battery <= 100) {
					cleanup();
					resolve(battery);
				}
			};

			const timeout = setTimeout(() => {
				cleanup();
				reject(new TimeoutError('Timeout waiting for battery report'));
			}, timeoutMs);

			this.on('batteryChange', handleBattery);
		});
	}

	startPolling(intervalMs = 500): void {
		if (!this.isOpen() || this.polling) return;
		this.polling = true;
		this.schedule(intervalMs);
	}

	private schedule(intervalMs: number): void {
		if (!this.polling) return;
		this.pollTimer = setTimeout(() => {
			this.pollTimer = null;
			if (!this.polling) return;
			try {
				// Drain all pending frames so bursts of replies don't queue up.
				// Every frame is also forwarded (query replies never match the
				// battery prefix, so sharing the stream is safe).
				for (let i = 0; i < 8; i++) {
					const frame = this.readFrame();
					if (!frame) break;
					const battery = parseBatteryFrame(frame);
					if (battery !== null && battery !== this.lastBattery) {
						this.lastBattery = battery;
						this.emit('batteryChange', battery);
					}
					try {
						this.onFrame?.(frame);
					} catch (error) {
						this.logger.warn('Battery monitor frame handler error', error);
					}
				}
			} catch (error) {
				this.logger.warn('Battery monitor read error', error);
			}
			this.schedule(intervalMs);
		}, intervalMs);
		if (this.pollTimer.unref) this.pollTimer.unref();
	}

	stopPolling(): void {
		this.polling = false;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
	}

	destroy(): void {
		this.stopPolling();
		this.removeAllListeners();
	}
}
