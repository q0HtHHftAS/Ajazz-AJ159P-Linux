import { ParamsError } from '../errors.js';
import { REPORT_LENGTH } from '../types.js';

/**
 * Report header for the polling-rate packet (family 02, SET, opcode 01).
 */
const POLLING_HEADER = [0x00, 0x02, 0x00, 0x01, 0x01] as const;

/** Polling interval in ms per rate, as the firmware encodes it. */
const RATE_TO_INTERVAL = {
	125: 8,
	250: 4,
	500: 2,
	1000: 1,
} as const;

export type PollingRate = keyof typeof RATE_TO_INTERVAL;

export interface PollingRateBuilderOptions {
	/** Polling rate in Hz (default 1000). */
	rate?: PollingRate;
}

/**
 * Builds the polling-rate report for the AJ159P receiver.
 *
 * Layout (33 bytes): `[00 02 00 01 01] [interval] [zero padding] [checksum]`.
 * Only 125/250/500/1000 Hz are observed on this receiver family.
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class PollingRateBuilder {
	private rate: PollingRate = 1000;

	constructor(options?: PollingRateBuilderOptions) {
		if (options?.rate !== undefined) this.setRate(options.rate);
	}

	setRate(rate: PollingRate): this {
		if (!(rate in RATE_TO_INTERVAL)) {
			throw new ParamsError('rate', 'rate must be one of 125, 250, 500, 1000');
		}
		this.rate = rate;
		return this;
	}

	static intervalFor(rate: PollingRate): number {
		return RATE_TO_INTERVAL[rate];
	}

	static rateForInterval(interval: number): PollingRate | null {
		for (const [rate, value] of Object.entries(RATE_TO_INTERVAL)) {
			if (value === interval) return Number(rate) as PollingRate;
		}
		return null;
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(POLLING_HEADER).copy(packet, 0);
		packet[5] = RATE_TO_INTERVAL[this.rate];
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
