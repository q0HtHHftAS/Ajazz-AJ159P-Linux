import { ParamsError } from '../errors.js';
import { REPORT_LENGTH } from '../types.js';
import { RgbBuilder } from './RgbBuilder.js';

/**
 * Report header for the per-DPI-stage colour packet (report 04, command 12).
 * Golden vector: `0004000112...` (see `__tests__/DpiColorBuilder.test.ts`).
 */
const DPI_COLOR_HEADER = [0x00, 0x04, 0x00, 0x01, 0x12] as const;

/** Distinct default stage colours (stages stay identifiable). */
export const DEFAULT_DPI_COLORS: [string, string, string, string, string, string] = [
	'#ff0000',
	'#00ff00',
	'#0000ff',
	'#ffff00',
	'#00ffff',
	'#ff00ff',
];

export interface DpiColorBuilderOptions {
	/** Six per-stage colours as `#rrggbb`. */
	colors?: [string, string, string, string, string, string];
}

/**
 * Builds the per-DPI-stage colour report for the AJ159P receiver.
 *
 * These colours drive the visible indicator LED (one colour per DPI
 * stage) — this IS the mouse's colour system. (The RGB triplet in the
 * static-lighting report is ignored by this firmware.)
 *
 * Layout (33 bytes): `[00 04 00 01 12] [6 x RGB triplet] [zero padding] [checksum]`.
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class DpiColorBuilder {
	private colors: [string, string, string, string, string, string] = [...DEFAULT_DPI_COLORS] as [
		string,
		string,
		string,
		string,
		string,
		string,
	];

	constructor(options?: DpiColorBuilderOptions) {
		if (options?.colors !== undefined) this.setColors(options.colors);
	}

	setColors(colors: [string, string, string, string, string, string]): this {
		if (!Array.isArray(colors) || colors.length !== 6) {
			throw new ParamsError('colors', 'exactly six DPI colours are required');
		}
		this.colors = colors.map((color, index) => RgbBuilder.normalizeColor(color, `colors[${index}]`)) as [
			string,
			string,
			string,
			string,
			string,
			string,
		];
		return this;
	}

	setColor(stage: number, color: string): this {
		if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
			throw new ParamsError('stage', 'DPI stage must be an integer between 1 and 6');
		}
		const colors = [...this.colors] as [string, string, string, string, string, string];
		colors[stage - 1] = RgbBuilder.normalizeColor(color, 'color');
		this.colors = colors;
		return this;
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(DPI_COLOR_HEADER).copy(packet, 0);
		this.colors.forEach((color, index) => {
			const start = 5 + index * 3;
			Buffer.from(color.slice(1), 'hex').copy(packet, start);
		});
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
