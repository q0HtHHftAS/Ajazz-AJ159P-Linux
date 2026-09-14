import { ParamsError } from '../errors.js';
import { REPORT_LENGTH } from '../types.js';

/**
 * Report header for the six-stage DPI packet (report 03, command 25).
 * Golden vector: `0003000125...` (see `__tests__/DpiBuilder.test.ts`).
 */
const DPI_HEADER = [0x00, 0x03, 0x00, 0x01, 0x25] as const;

/** Minimum DPI value accepted by the hardware. */
export const DPI_MIN = 100;

/** Maximum DPI value accepted by the hardware. */
export const DPI_MAX = 26000;

/** DPI granularity accepted by the hardware. */
export const DPI_STEP = 100;

/** Factory DPI values (six stages, read back from a live AJ159P). */
export const DEFAULT_DPI_VALUES: [number, number, number, number, number, number] = [
	1600, 3200, 4800, 6400, 12800, 23200,
];

/** Factory active stage (1-based). */
export const DEFAULT_DPI_SELECTED = 1 as const;

export interface DpiBuilderOptions {
	/** Active stage (1-based, default 1). */
	selected?: number;
	/** Six DPI values (default factory values). */
	values?: [number, number, number, number, number, number];
}

/**
 * Builds the six-stage DPI report for the AJ159P receiver.
 *
 * Layout (33 bytes): `[00 03 00 01 25] [sel|06] [6 x (u16LE dpi/50, duplicated)] [checksum]`.
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class DpiBuilder {
	private selected: number = DEFAULT_DPI_SELECTED;
	private values: [number, number, number, number, number, number] = [...DEFAULT_DPI_VALUES] as [
		number,
		number,
		number,
		number,
		number,
		number,
	];

	constructor(options?: DpiBuilderOptions) {
		if (options?.selected !== undefined) this.setSelected(options.selected);
		if (options?.values !== undefined) this.setValues(options.values);
	}

	setSelected(selected: number): this {
		if (!Number.isInteger(selected) || selected < 1 || selected > 6) {
			throw new ParamsError('selected', 'DPI stage must be an integer between 1 and 6');
		}
		this.selected = selected;
		return this;
	}

	setValues(values: [number, number, number, number, number, number]): this {
		if (!Array.isArray(values) || values.length !== 6) {
			throw new ParamsError('values', 'DPI values must be an array of 6 numbers');
		}
		values.forEach((value, index) => this.validateDpi(value, `values[${index}]`));
		this.values = [...values] as [number, number, number, number, number, number];
		return this;
	}

	setValue(stage: number, dpi: number): this {
		if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
			throw new ParamsError('stage', 'DPI stage must be an integer between 1 and 6');
		}
		this.validateDpi(dpi, 'dpi');
		const values = [...this.values] as [number, number, number, number, number, number];
		values[stage - 1] = dpi;
		this.values = values;
		return this;
	}

	private validateDpi(value: number, name: string): void {
		if (!Number.isInteger(value) || value < DPI_MIN || value > DPI_MAX || value % DPI_STEP !== 0) {
			throw new ParamsError(name, `DPI must be ${DPI_MIN}..${DPI_MAX} in steps of ${DPI_STEP}`);
		}
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(DPI_HEADER).copy(packet, 0);
		// High nibble = zero-based selected stage, low nibble = constant 6 (six slots).
		packet[5] = ((this.selected - 1) << 4) | 0x06;
		this.values.forEach((value, index) => {
			const encoded = value / DPI_STEP;
			const start = 6 + index * 4;
			packet.writeUInt16LE(encoded, start);
			packet.writeUInt16LE(encoded, start + 2);
		});
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
