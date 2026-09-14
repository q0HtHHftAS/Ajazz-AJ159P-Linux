import { EventEmitter } from 'node:events';
import { BatteryMonitor } from './BatteryMonitor.js';
import { findReceiverHidraw, openReceiverHidraw, type HidrawHandle } from './HidrawTransport.js';
import { DpiBuilder, type DpiBuilderOptions } from '../protocols/DpiBuilder.js';
import { DpiColorBuilder, type DpiColorBuilderOptions } from '../protocols/DpiColorBuilder.js';
import { KeyTableBuilder, type ButtonPresetId } from '../protocols/KeyTableBuilder.js';
import {
	QUERY_DEVICE_INFO,
	QUERY_DPI_COLOR_TABLE,
	QUERY_DPI_TABLE,
	QUERY_KEY_TABLE,
	QUERY_LED_MODE,
	QUERY_REPORT_RATE,
	QUERY_SENSOR,
	buildQuery,
	parseDeviceInfoReply,
	parseDpiColorReply,
	parseDpiTableReply,
	parseLedModeReply,
} from '../protocols/Queries.js';
import {
	PollingRateBuilder,
	type PollingRate,
	type PollingRateBuilderOptions,
} from '../protocols/PollingRateBuilder.js';
import { SensorBuilder } from '../protocols/SensorBuilder.js';
import { RgbBuilder, type RgbBuilderOptions } from '../protocols/RgbBuilder.js';
import { DriverError, TimeoutError } from '../errors.js';
import { AJAZZ_VID, AJ159P_PID, type DeviceModel, type DpiConfig, type Logger, type RgbConfig } from '../types.js';

const defaultLogger: Logger = {
	debug: (m, c) => console.debug({ time: new Date().toISOString(), level: 'debug', message: m, context: c }),
	info: (m, c) => console.info({ time: new Date().toISOString(), level: 'info', message: m, context: c }),
	warn: (m, c) => console.warn({ time: new Date().toISOString(), level: 'warn', message: m, context: c }),
	error: (m, c) => console.error({ time: new Date().toISOString(), level: 'error', message: m, context: c }),
};

export interface AjazzAJ159PEvents {
	batteryChange: [battery: number];
	error: [error: Error];
}

export interface AjazzAJ159POptions {
	/** Device model label (protocol is identical). */
	deviceModel?: DeviceModel;
	/** Injected logger. */
	logger?: Logger;
	/** Injected transport (tests). When omitted, the real hidraw node is used. */
	transport?: { node: string; handle: HidrawHandle };
}

/**
 * Driver for the AJAZZ AJ159P / AJ159 Pro gaming mouse over its 2.4 GHz
 * receiver (XCTECH 249a:5c2f, vendor interface MI_02).
 *
 * All settings are 33-byte HID reports written to `/dev/hidraw`. Battery
 * level arrives as `C0` frames on the same node and is exposed through the
 * `batteryChange` event.
 */
export class AjazzAJ159P extends EventEmitter<AjazzAJ159PEvents> {
	readonly deviceModel: DeviceModel;
	private _hidrawNode: string | null;
	get hidrawNode(): string | null {
		return this._hidrawNode;
	}
	private handle: HidrawHandle | null;
	private readonly ownsHandle: boolean;
	private isDeviceOpen = false;
	private lastBattery = -1;
	private logger: Logger;
	private batteryMonitor: BatteryMonitor | null = null;
	private batteryTimer: ReturnType<typeof setInterval> | null = null;
	/**
	 * Serializes all GET queries: concurrent queries would drain each
	 * other's replies off the shared hidraw node (all readers see all
	 * frames), so they must never overlap.
	 */
	private queryQueue: Promise<unknown> = Promise.resolve();

	constructor(options?: AjazzAJ159POptions) {
		super();
		this.logger = options?.logger ?? defaultLogger;
		this.deviceModel = options?.deviceModel ?? 'AJ159P';
		this._hidrawNode = options?.transport?.node ?? null;
		this.handle = options?.transport?.handle ?? null;
		this.ownsHandle = options?.transport === undefined;
	}

	/**
	 * Returns the receiver hidraw node when plugged in, without opening it.
	 */
	static detectDevice(): { detected: boolean; node?: string } {
		const node = findReceiverHidraw();
		return node ? { detected: true, node } : { detected: false };
	}

	open(): Promise<void> {
		this.logger.info(
			`Searching for AJ159P receiver VID:${AJAZZ_VID.toString(16)} PID:${AJ159P_PID.toString(16)}...`,
		);
		if (!this.handle) {
			const { node, handle } = openReceiverHidraw();
			this.handle = handle;
			this._hidrawNode = node;
		}
		this.logger.info(`Using receiver node ${this.hidrawNode}...`);
		this.isDeviceOpen = true;

		const handle = this.handle;
		this.batteryMonitor = new BatteryMonitor(
			() => handle.read(),
			this.logger,
			() => this.isDeviceOpen,
			(frame) => this.deliverFrame(frame),
		);
		this.batteryMonitor.on('batteryChange', (level) => {
			this.lastBattery = level;
			this.emit('batteryChange', level);
		});
		this.batteryMonitor.on('error', (error) => {
			this.emit('error', error);
		});
		this.batteryMonitor.startPolling(250);
		this.startBatteryRefresh();
		this.logger.info('Device ready.');
		return Promise.resolve();
	}

	close(): Promise<void> {
		if (!this.isDeviceOpen) return Promise.resolve();
		this.logger.info('Closing driver and releasing resources...');
		this.removeAllListeners();
		this.stopBatteryRefresh();
		if (this.batteryMonitor) {
			this.batteryMonitor.destroy();
			this.batteryMonitor = null;
		}
		if (this.handle && this.ownsHandle) {
			try {
				this.handle.close();
			} catch (error) {
				this.logger.error('Error while closing hidraw handle', error);
			}
		}
		this.handle = null;
		this.isDeviceOpen = false;
		this.logger.info('Driver closed.');
		return Promise.resolve();
	}

	checkIsOpen(): void {
		if (!this.isDeviceOpen || !this.handle) throw new DriverError('You have to open the device first');
	}

	private sendReport(data: Buffer): number {
		this.checkIsOpen();
		this.handle?.write(data);
		return data.length;
	}

	/**
	 * Sends a GET query and waits for the matching reply frame.
	 *
	 * Battery polling is paused for the duration so the monitor cannot
	 * consume the reply first (all readers share the same hidraw node).
	 * Calls are serialized through an internal queue (see `queryQueue`).
	 */
	queryReport(queryId: number, timeoutMs = 1500): Promise<Buffer> {
		const run = this.queryQueue.then(() => this.doQueryReport(queryId, timeoutMs));
		this.queryQueue = run.catch(() => {
			// Swallowed — the next queued query must still run.
		});
		return run;
	}

	private doQueryReport(queryId: number, timeoutMs: number): Promise<Buffer> {
		const handle = this.handle;
		if (!handle) throw new DriverError('You have to open the device first');
		// The monitor keeps polling and forwards every frame (see
		// deliverFrame) — replies can no longer be lost between readers.
		// Stale frames can't collide: SET echoes use family bytes below
		// 0x10, which are never query IDs.
		const attempt = (): Promise<Buffer> =>
			new Promise<Buffer>((resolve, reject) => {
				const timer = setTimeout(() => {
					if (this.queryWaiter?.timer === timer) this.queryWaiter = null;
					reject(new TimeoutError(`Timeout waiting for query 0x${queryId.toString(16)} reply`));
				}, timeoutMs);
				if (timer.unref) timer.unref();
				this.queryWaiter = { id: queryId, resolve, timer };
				try {
					handle.write(buildQuery(queryId));
				} catch (error) {
					clearTimeout(timer);
					this.queryWaiter = null;
					reject(error);
				}
			});
		const spaced = async (): Promise<Buffer> => {
			const gap = Date.now() - this.lastQueryAt;
			if (gap < AjazzAJ159P.QUERY_GAP_MS) {
				await new Promise((r) => setTimeout(r, AjazzAJ159P.QUERY_GAP_MS - gap));
			}
			try {
				return await attempt();
			} finally {
				this.lastQueryAt = Date.now();
			}
		};
		// One retry: a query sent while the firmware is still busy can be
		// dropped silently.
		return spaced().catch(() => spaced());
	}

	private queryWaiter: { id: number; resolve: (frame: Buffer) => void; timer: ReturnType<typeof setTimeout> } | null =
		null;

	/** Minimum gap between queries — the firmware drops queries sent back-to-back. */
	private lastQueryAt = 0;
	private static readonly QUERY_GAP_MS = 250;

	private deliverFrame(frame: Buffer): void {
		const waiter = this.queryWaiter;
		if (waiter && frame[0] === waiter.id && frame[2] === 0x01) {
			this.queryWaiter = null;
			clearTimeout(waiter.timer);
			waiter.resolve(frame);
		}
	}

	getBatteryLevel(timeoutMs = 5000): Promise<number> {
		this.checkIsOpen();
		return this.queryReport(QUERY_DEVICE_INFO, timeoutMs).then(
			(reply) => {
				const info = parseDeviceInfoReply(reply);
				if (info.battery !== this.lastBattery) {
					this.lastBattery = info.battery;
					this.emit('batteryChange', info.battery);
				}
				return info.battery;
			},
			(error: unknown) => {
				// Fall back to the last C0-push reading, if any.
				if (this.lastBattery !== -1 && this.lastBattery <= 100) return this.lastBattery;
				throw error;
			},
		);
	}

	/**
	 * Re-reads the battery via query `0x10` on an interval — the mouse only
	 * pushes C0 frames on its own schedule, so polling the query is what
	 * keeps the UI live. Failures are ignored until the next tick.
	 */
	private startBatteryRefresh(intervalMs = 30000): void {
		this.stopBatteryRefresh();
		this.batteryTimer = setInterval(() => {
			void this.getBatteryLevel(3000).catch(() => {
				// Ignored — retried on the next tick.
			});
		}, intervalMs);
		if (this.batteryTimer.unref) this.batteryTimer.unref();
	}

	private stopBatteryRefresh(): void {
		if (this.batteryTimer) {
			clearInterval(this.batteryTimer);
			this.batteryTimer = null;
		}
	}

	onBatteryChange(listener: (battery: number) => void): () => void {
		this.checkIsOpen();
		this.on('batteryChange', listener);
		return () => {
			this.removeListener('batteryChange', listener);
		};
	}

	setDpi(options: DpiBuilder | DpiBuilderOptions | DpiConfig): Promise<number> {
		const builder = options instanceof DpiBuilder ? options : new DpiBuilder(options);
		return Promise.resolve(this.sendReport(builder.build()));
	}

	setRgb(options: RgbBuilder | RgbBuilderOptions | RgbConfig): Promise<number> {
		if (options instanceof RgbBuilder) {
			return Promise.resolve(this.sendReport(options.build()));
		}
		const builderOptions: RgbBuilderOptions = {};
		if (options.mode !== undefined) builderOptions.mode = options.mode;
		if ('color' in options && options.color !== undefined) builderOptions.color = options.color;
		if ('brightness' in options && options.brightness !== undefined) builderOptions.brightness = options.brightness;
		if ('speed' in options && options.speed !== undefined) builderOptions.speed = options.speed;
		return Promise.resolve(this.sendReport(new RgbBuilder(builderOptions).build()));
	}

	setDpiColors(options: DpiColorBuilder | DpiColorBuilderOptions): Promise<number> {
		const builder = options instanceof DpiColorBuilder ? options : new DpiColorBuilder(options);
		return Promise.resolve(this.sendReport(builder.build()));
	}

	setPollingRate(rate: PollingRate | PollingRateBuilder | PollingRateBuilderOptions): Promise<number> {
		const builder =
			rate instanceof PollingRateBuilder
				? rate
				: new PollingRateBuilder(typeof rate === 'number' ? { rate } : rate);
		return Promise.resolve(this.sendReport(builder.build()));
	}

	/**
	 * Reads back the active polling rate via query `0x12`.
	 * Returns `null` when the firmware reports an unknown interval.
	 */
	async getPollingRate(): Promise<PollingRate | null> {
		const reply = await this.queryReport(QUERY_REPORT_RATE);
		return PollingRateBuilder.rateForInterval(reply[4] ?? 0xff);
	}

	/**
	 * Sets the auto-sleep timer, preserving the lift-off and idle-light
	 * bytes via read-modify-write (query `0x17`).
	 */
	async setSleepMinutes(minutes: number): Promise<number> {
		const reply = await this.queryReport(QUERY_SENSOR);
		const builder = SensorBuilder.fromQueryReply(reply).setSleepMinutes(minutes);
		return this.sendReport(builder.build());
	}

	async getSensorSettings(): Promise<{ sleepMinutes: number; liftOff: number; idleLightOff: number }> {
		const reply = await this.queryReport(QUERY_SENSOR);
		return SensorBuilder.fromQueryReply(reply).getSettings();
	}

	/**
	 * Reads the full 9-slot button table via query `0x11`.
	 */
	async getKeySlots(): Promise<[number, number, number][]> {
		const reply = await this.queryReport(QUERY_KEY_TABLE);
		return KeyTableBuilder.fromQueryReply(reply).getSlots();
	}

	/**
	 * Remaps one button (slot 0-4), preserving all other slots via
	 * read-modify-write (query `0x11`).
	 */
	async setKeySlot(slot: number, preset: ButtonPresetId): Promise<number> {
		const reply = await this.queryReport(QUERY_KEY_TABLE);
		const builder = KeyTableBuilder.fromQueryReply(reply).setSlotPreset(slot, preset);
		return this.sendReport(builder.build());
	}

	async resetKeySlot(slot: number): Promise<number> {
		const reply = await this.queryReport(QUERY_KEY_TABLE);
		const builder = KeyTableBuilder.fromQueryReply(reply).setSlotDefault(slot);
		return this.sendReport(builder.build());
	}

	/**
	 * Remaps multiple buttons in a single read-modify-write cycle.
	 * Entries may be a preset, `'default'` (factory), or `'custom'`
	 * (leave the slot untouched).
	 */
	async setKeySlots(presets: (ButtonPresetId | 'default' | 'custom')[]): Promise<number> {
		const reply = await this.queryReport(QUERY_KEY_TABLE);
		const builder = KeyTableBuilder.fromQueryReply(reply);
		presets.slice(0, 5).forEach((preset, slot) => {
			if (preset === 'custom') return;
			if (preset === 'default') builder.setSlotDefault(slot);
			else builder.setSlotPreset(slot, preset);
		});
		return this.sendReport(builder.build());
	}

	async getDpiTable(): Promise<{ selected: number; values: [number, number, number, number, number, number] }> {
		const reply = await this.queryReport(QUERY_DPI_TABLE);
		const table = parseDpiTableReply(reply);
		return {
			selected: table.activeStage + 1,
			values: table.x.map((v) => v * 100) as [number, number, number, number, number, number],
		};
	}

	async getLedEffect(): Promise<{ mode: 'off' | 'static' | 'breathing'; brightness: number; speed: number }> {
		const reply = await this.queryReport(QUERY_LED_MODE);
		return parseLedModeReply(reply);
	}

	async getStageColors(): Promise<[string, string, string, string, string, string]> {
		const reply = await this.queryReport(QUERY_DPI_COLOR_TABLE);
		return parseDpiColorReply(reply).colors;
	}

	/**
	 * Reapplies DPI + lighting (the closest equivalent of a factory reset
	 * available on this protocol).
	 */
	async reset(defaults?: { dpi?: DpiBuilderOptions; rgb?: RgbBuilderOptions }): Promise<void> {
		this.checkIsOpen();
		await this.setDpi(new DpiBuilder(defaults?.dpi));
		await this.setRgb(new RgbBuilder(defaults?.rgb));
	}

	getDeviceInfo(): {
		manufacturer: string;
		product: string;
		vendorId: string;
		productId: string;
		connectionMode: string;
		hidrawNode: string | null;
	} {
		this.checkIsOpen();
		return {
			manufacturer: 'XCTECH',
			product: this.deviceModel === 'AJ159Pro' ? 'AJAZZ AJ159 Pro' : 'AJAZZ AJ159P',
			vendorId: `0x${AJAZZ_VID.toString(16).padStart(4, '0')}`,
			productId: `0x${AJ159P_PID.toString(16).padStart(4, '0')}`,
			connectionMode: 'Wireless (2.4GHz)',
			hidrawNode: this.hidrawNode,
		};
	}
}

export default AjazzAJ159P;
