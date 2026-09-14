/**
 * Shared types for the AJAZZ AJ159P hidraw driver.
 *
 * Transport note: unlike USB control-transfer mice, the AJ159P 2.4 GHz
 * receiver (XCTECH 249a:5c2f) is driven through 33-byte HID reports on the
 * vendor interface (`/dev/hidraw`, MI_02). First byte is the HID report ID
 * (`0x00`), followed by a 32-byte vendor payload. Protocol reverse-engineered
 * from the official Windows driver traffic (see aj179ctl reference and
 * `docs/protocols/`).
 */

/** USB vendor ID of the 2.4 GHz receiver. */
export const AJAZZ_VID = 0x249a;

/** USB product ID of the 2.4 GHz receiver (shared with AJ179 family). */
export const AJ159P_PID = 0x5c2f;

/** HID report size: 1 report-ID byte + 32 payload bytes. */
export const REPORT_LENGTH = 33;

/**
 * Device model identifier.
 */
export type DeviceModel = 'AJ159P' | 'AJ159Pro';

/**
 * Lighting effect mode.
 */
export type RgbMode = 'off' | 'static' | 'breathing';

/**
 * Six-stage DPI configuration.
 */
export interface DpiConfig {
	/** Active stage (1-based). */
	selected: 1 | 2 | 3 | 4 | 5 | 6;
	/** Six DPI values, 50..24000 in steps of 50. */
	values: [number, number, number, number, number, number];
}

/**
 * Lighting configuration.
 */
export interface RgbConfig {
	/** Effect mode. */
	mode: RgbMode;
	/** Effect colour as `#rrggbb` (used by `static` mode). */
	color: string;
	/** Brightness 0..4 (4 = 100%). */
	brightness: 0 | 1 | 2 | 3 | 4;
	/** Breathing speed 0..4. */
	speed: 0 | 1 | 2 | 3 | 4;
}

/**
 * Supported log levels.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for the driver's internal logger.
 */
export interface Logger {
	/** Logs a debug message */
	debug(message: string, context?: unknown): void;

	/** Logs an informational message */
	info(message: string, context?: unknown): void;

	/** Logs a warning */
	warn(message: string, context?: unknown): void;

	/** Logs an error */
	error(message: string, context?: unknown): void;
}
