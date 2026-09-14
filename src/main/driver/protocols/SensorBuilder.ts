import { ParamsError } from '../errors.js';
import { REPORT_LENGTH } from '../types.js';

/**
 * Report header for the sensor packet (family 07, SET, opcode 04).
 * Packs four unrelated settings — always read-modify-write, never build
 * from scratch (see `fromQueryReply`).
 */
const SENSOR_HEADER = [0x00, 0x07, 0x00, 0x01, 0x04] as const;

/** Sleep dropdown values (minutes) offered by the official driver. */
export const SLEEP_PRESETS_MINUTES = [10 / 60, 30 / 60, 1, 2, 5, 10, 20, 30] as const;

export type SleepMinutes = (typeof SLEEP_PRESETS_MINUTES)[number];

export interface SensorSettings {
	/** Auto-sleep timer in minutes (one of the official presets). */
	sleepMinutes: number;
	/** Lift-off / wake-on-motion byte (opaque — preserved, never defaulted). */
	liftOff: number;
	/** Turn light off when idle (0/1). */
	idleLightOff: number;
}

/**
 * Builds the sensor report (auto-sleep timer) for the AJ159P receiver.
 *
 * Layout (33 bytes): `[00 07 00 01 04] [sleep10s] [liftOff] [idleLightOff] [08] [zeros] [checksum]`.
 * `sleep10s` = sleep time in 10-second units (1/3/6/12/30/60/120/180).
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class SensorBuilder {
	private settings: SensorSettings = { sleepMinutes: 10, liftOff: 1, idleLightOff: 0 };

	private constructor(settings: SensorSettings) {
		this.settings = { ...settings };
	}

	/**
	 * Seeds a builder from a `0x17` query reply, preserving the bytes this
	 * command shares with lift-off and idle-light settings.
	 */
	static fromQueryReply(reply: Buffer): SensorBuilder {
		if (reply.length < 9 || reply[0] !== 0x17 || reply[2] !== 0x01) {
			throw new ParamsError('reply', 'not a sensor (0x17) query reply');
		}
		const meaningful = reply[3] ?? 0;
		if (meaningful < 4) {
			throw new ParamsError('reply', 'sensor reply too short');
		}
		return new SensorBuilder({
			sleepMinutes: ((reply[4] ?? 0) * 10) / 60,
			liftOff: reply[5] ?? 0,
			idleLightOff: reply[6] ?? 0,
		});
	}

	static sleepMinutesToUnits(minutes: number): number {
		const seconds = Math.round(minutes * 60);
		const rounded = Math.floor(seconds / 10);
		if (rounded < 0 || rounded > 255) {
			throw new ParamsError('sleepMinutes', 'sleep time out of range');
		}
		return rounded;
	}

	setSleepMinutes(minutes: number): this {
		SensorBuilder.sleepMinutesToUnits(minutes); // validates range
		this.settings.sleepMinutes = minutes;
		return this;
	}

	getSettings(): SensorSettings {
		return { ...this.settings };
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(SENSOR_HEADER).copy(packet, 0);
		packet[5] = SensorBuilder.sleepMinutesToUnits(this.settings.sleepMinutes);
		packet[6] = this.settings.liftOff;
		packet[7] = this.settings.idleLightOff;
		packet[8] = 0x08;
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
