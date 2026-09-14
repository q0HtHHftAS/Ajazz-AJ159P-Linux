import { ParamsError } from '../errors.js';
import { REPORT_LENGTH, type RgbMode } from '../types.js';

/**
 * Report header for the lighting packet (report 05).
 * Golden vectors: `00050001...` (see `__tests__/RgbBuilder.test.ts`).
 */
const RGB_HEADER = [0x00, 0x05, 0x00, 0x01] as const;

/** Fixed seven-colour palette used by the official breathing effect. */
const BREATHING_PALETTE = 'ff0000 00ff00 0000ff 00ffff ffff00 ff00ff ffffff';

export interface RgbBuilderOptions {
	/** Effect mode (default `'off'`). */
	mode?: RgbMode;
	/** Effect colour as `#rrggbb` (used by `static` mode). */
	color?: string;
	/** Brightness 0..4, 4 = 100% (default 4). */
	brightness?: number;
	/** Breathing speed 0..4 (default 2). */
	speed?: number;
}

/**
 * Builds the lighting-effect report for the AJ159P receiver.
 *
 * Layout (33 bytes): `[00 05 00 01] [mode 2B] [brightness|speed] [payload] [checksum]`.
 * Modes: off = `02 00`, breathing = `18 02`, static = `05 03`.
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class RgbBuilder {
	private mode: RgbMode = 'off';
	private color = '#8b5cf6';
	private brightness = 4;
	private speed = 2;

	constructor(options?: RgbBuilderOptions) {
		if (options?.mode !== undefined) this.setMode(options.mode);
		if (options?.color !== undefined) this.setColor(options.color);
		if (options?.brightness !== undefined) this.setBrightness(options.brightness);
		if (options?.speed !== undefined) this.setSpeed(options.speed);
	}

	setMode(mode: RgbMode): this {
		if (mode !== 'off' && mode !== 'static' && mode !== 'breathing') {
			throw new ParamsError('mode', 'mode must be off, static, or breathing');
		}
		this.mode = mode;
		return this;
	}

	setColor(color: string): this {
		this.color = RgbBuilder.normalizeColor(color, 'color');
		return this;
	}

	setBrightness(brightness: number): this {
		if (!Number.isInteger(brightness) || brightness < 0 || brightness > 4) {
			throw new ParamsError('brightness', 'brightness must be an integer between 0 and 4');
		}
		this.brightness = brightness;
		return this;
	}

	setSpeed(speed: number): this {
		if (!Number.isInteger(speed) || speed < 0 || speed > 4) {
			throw new ParamsError('speed', 'speed must be an integer between 0 and 4');
		}
		this.speed = speed;
		return this;
	}

	static normalizeColor(color: string, name: string): string {
		if (typeof color !== 'string') {
			throw new ParamsError(name, 'color must be #RRGGBB');
		}
		const value = color.startsWith('#') ? color.slice(1) : color;
		if (!/^[0-9a-fA-F]{6}$/.test(value)) {
			throw new ParamsError(name, 'color must be #RRGGBB');
		}
		return `#${value.toLowerCase()}`;
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(RGB_HEADER).copy(packet, 0);
		// The official UI exposes five positions for each setting, encoded in the
		// high and low nibbles respectively. 100% brightness is 4, not 5.
		packet[6] = (this.brightness << 4) | this.speed;
		if (this.mode === 'off') {
			packet[4] = 0x02;
			packet[5] = 0x00;
		} else if (this.mode === 'breathing') {
			packet[4] = 0x18;
			packet[5] = 0x02;
			packet[7] = 7;
			// The Windows driver uses a fixed seven-colour breathing palette.
			Buffer.from(BREATHING_PALETTE.replaceAll(' ', ''), 'hex').copy(packet, 8);
		} else {
			packet[4] = 0x05;
			packet[5] = 0x03;
			Buffer.from(this.color.slice(1), 'hex').copy(packet, 7);
		}
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
