import { ParamsError } from '../errors.js';

/**
 * GET query IDs. Names match the firmware's debug strings
 * (`cmd get all key`, `cmd get reportrate`, `cmd get dpi value`, ...).
 */
export const QUERY_DEVICE_INFO = 0x10;
export const QUERY_KEY_TABLE = 0x11;
export const QUERY_REPORT_RATE = 0x12;
export const QUERY_DPI_TABLE = 0x13;
export const QUERY_DPI_COLOR_TABLE = 0x14;
export const QUERY_LED_MODE = 0x15;
export const QUERY_SENSOR = 0x17;

export interface DpiTableReply {
	/** Zero-based active stage. */
	activeStage: number;
	/** Low nibble of the flags byte (constant per firmware family). */
	flagsNibble: number;
	/** Six X-axis raw values (u16LE). */
	x: [number, number, number, number, number, number];
	/** Six Y-axis raw values (u16LE). */
	y: [number, number, number, number, number, number];
}

export interface DeviceInfoReply {
	/** 4-byte device ID (e.g. `M620` for the AJ159 family). */
	devId: string;
	/** Live battery percentage (0-100). */
	battery: number;
}

export interface DpiColorReply {
	/** Six per-stage colours as `#rrggbb`. */
	colors: [string, string, string, string, string, string];
}

export interface LedModeReply {
	/** Effect decoded from the reply opcode. */
	mode: 'off' | 'static' | 'breathing';
	/** Brightness 0..4 (settled reads only — fresh switches need ~3s). */
	brightness: number;
	/** Speed 0..4 (meaningful for breathing). */
	speed: number;
}

/**
 * Builds a 33-byte GET query report: `[00, queryId, 00, 00, zeros...]`.
 */
export function buildQuery(queryId: number): Buffer {
	if (!Number.isInteger(queryId) || queryId < 0 || queryId > 0xff) {
		throw new ParamsError('queryId', 'query ID must be a byte');
	}
	const packet = Buffer.alloc(33, 0);
	packet[1] = queryId;
	return packet;
}

/**
 * Parses a DPI table reply (query `0x13`): `[13, 00, 01, len, flags, 6 x (Xlo,Xhi,Ylo,Yhi), ...]`.
 *
 * The raw values still need a scale factor to become DPI — see the DPI
 * encoding note in `DpiBuilder.ts`.
 */
export function parseDpiTableReply(frame: Buffer): DpiTableReply {
	if (frame.length < 29 || frame[0] !== QUERY_DPI_TABLE || frame[2] !== 0x01) {
		throw new ParamsError('frame', 'not a DPI table reply');
	}
	const flags = frame[4] ?? 0;
	const x = [0, 1, 2, 3, 4, 5].map((i) => frame.readUInt16LE(5 + i * 4)) as [
		number,
		number,
		number,
		number,
		number,
		number,
	];
	const y = [0, 1, 2, 3, 4, 5].map((i) => frame.readUInt16LE(7 + i * 4)) as [
		number,
		number,
		number,
		number,
		number,
		number,
	];
	return { activeStage: flags >> 4, flagsNibble: flags & 0x0f, x, y };
}

/**
 * Parses a device-info reply (query `0x10`): `[10, 00, 01, len, devId(4 ASCII), ..., battery@payload9, ...]`.
 *
 * The battery byte is a plain 0-100 percentage (confirmed against the
 * official driver's own handling). Query `0x20` is unreliable — do not use it.
 */
export function parseDeviceInfoReply(frame: Buffer): DeviceInfoReply {
	if (frame.length < 14 || frame[0] !== QUERY_DEVICE_INFO || frame[2] !== 0x01) {
		throw new ParamsError('frame', 'not a device-info reply');
	}
	const battery = frame[13] ?? 101;
	if (battery > 100) {
		throw new ParamsError('frame', 'device-info reply has no battery reading');
	}
	return { devId: Buffer.from(frame.subarray(4, 8)).toString('ascii'), battery };
}

/**
 * Parses a stage-colour reply (query `0x14`): opcode = colour count x 3,
 * followed by raw R,G,B triples with no header.
 */
export function parseDpiColorReply(frame: Buffer): DpiColorReply {
	if (frame.length < 22 || frame[0] !== QUERY_DPI_COLOR_TABLE || frame[2] !== 0x01) {
		throw new ParamsError('frame', 'not a stage-colour reply');
	}
	const toHex = (v: number): string => (v ?? 0).toString(16).padStart(2, '0');
	const colors = [0, 1, 2, 3, 4, 5].map(
		(i) => `#${toHex(frame[4 + i * 3] ?? 0)}${toHex(frame[5 + i * 3] ?? 0)}${toHex(frame[6 + i * 3] ?? 0)}`,
	) as [string, string, string, string, string, string];
	return { colors };
}

/**
 * Parses a lighting-state reply (query `0x15`): opcode `0x01` = off,
 * `0x05` = static, `0x18` = breathing; brightness/speed live in the
 * nibbles of byte 5.
 *
 * Note: after an effect-type switch the opcode flips fast but the payload
 * can lag up to ~3s — only trust brightness/speed from settled reads
 * (e.g. app startup, not right after applying a change).
 */
export function parseLedModeReply(frame: Buffer): LedModeReply {
	if (frame.length < 6 || frame[0] !== QUERY_LED_MODE || frame[2] !== 0x01) {
		throw new ParamsError('frame', 'not a lighting-state reply');
	}
	const opcode = frame[3] ?? 0;
	const mode = opcode === 0x01 ? 'off' : opcode === 0x05 ? 'static' : opcode === 0x18 ? 'breathing' : null;
	if (!mode) {
		throw new ParamsError('frame', `unknown lighting opcode 0x${opcode.toString(16)}`);
	}
	return { mode, brightness: (frame[5] ?? 0) >> 4, speed: (frame[5] ?? 0) & 0x0f };
}
