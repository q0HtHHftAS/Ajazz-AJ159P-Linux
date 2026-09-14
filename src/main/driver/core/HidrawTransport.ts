import {
	constants,
	existsSync,
	openSync,
	readSync,
	writeSync,
	closeSync,
	readdirSync,
	readFileSync,
	realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { DeviceError } from '../errors.js';
import { AJAZZ_VID, AJ159P_PID, REPORT_LENGTH } from '../types.js';

/** HID ID string as it appears in the device uevent file under /sys/class/hidraw. */
const TARGET_HID_ID = 'HID_ID=0003:0000249A:00005C2F';

/**
 * Minimal synchronous hidraw handle. Kept interface-small so tests can inject
 * a fake without touching `/dev`.
 */
export interface HidrawHandle {
	/** Writes a full report; throws on short write. */
	write(data: Buffer): void;
	/** Reads one frame, or `null` when no data is available. */
	read(): Buffer | null;
	/** Releases the file descriptor. */
	close(): void;
}

class NodeHidrawHandle implements HidrawHandle {
	private fd: number;
	private closed = false;

	constructor(path: string) {
		// O_NONBLOCK so battery polling never stalls the main process.
		this.fd = openSync(path, constants.O_RDWR | constants.O_NONBLOCK);
	}

	write(data: Buffer): void {
		if (this.closed) throw new DeviceError('hidraw handle is closed');
		const written = writeSync(this.fd, data, 0, data.length);
		if (written !== data.length) {
			throw new DeviceError(`short HID write: ${written}/${data.length}`);
		}
	}

	read(): Buffer | null {
		if (this.closed) return null;
		const buffer = Buffer.alloc(64);
		try {
			const bytesRead = readSync(this.fd, buffer, 0, buffer.length, null);
			if (bytesRead <= 0) return null;
			return buffer.subarray(0, bytesRead);
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') return null;
			throw error;
		}
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		try {
			closeSync(this.fd);
		} catch {
			// Already closed by the OS (e.g. device unplugged) — not fatal.
		}
	}
}

/**
 * Finds the vendor-interface hidraw node (`MI_02`, interface 1.2) of the
 * AJ159P 2.4 GHz receiver by scanning `/sys/class/hidraw`.
 *
 * @returns `/dev/hidrawN` path, or `null` when not present.
 */
export function findReceiverHidraw(sysfsRoot = '/sys/class/hidraw'): string | null {
	let entries: string[];
	try {
		entries = readdirSync(sysfsRoot)
			.filter((entry) => entry.startsWith('hidraw'))
			.sort();
	} catch {
		return null;
	}
	for (const entry of entries) {
		let uevent: string;
		let resolved: string;
		try {
			uevent = readFileSync(join(sysfsRoot, entry, 'device', 'uevent'), 'utf-8');
			resolved = join(sysfsRoot, entry, 'device');
			// Resolve the `device` symlink to check the USB interface number.
			resolved = realpathSync(resolved);
		} catch {
			continue;
		}
		// MI_02 is the vendor/status channel. MI_00 and MI_01 share the same
		// VID:PID but carry normal mouse and keyboard reports.
		if (uevent.includes(TARGET_HID_ID) && resolved.includes(':1.2/')) {
			const node = `/dev/${entry}`;
			if (existsSync(node)) return node;
		}
	}
	return null;
}

/**
 * Opens the receiver's vendor-interface hidraw node for reports.
 *
 * @throws DeviceError when the receiver is not plugged in or not accessible
 * (missing udev rule — see `install.sh`).
 */
export function openReceiverHidraw(path?: string): { node: string; handle: HidrawHandle } {
	const node = path ?? findReceiverHidraw();
	if (!node) {
		throw new DeviceError(
			`AJ159P receiver (VID ${AJAZZ_VID.toString(16)} PID ${AJ159P_PID.toString(16)}) not found. ` +
				'Plug in the 2.4 GHz dongle and check the udev rules.',
		);
	}
	try {
		return { node, handle: new NodeHidrawHandle(node) };
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === 'EACCES' || err.code === 'EPERM') {
			throw new DeviceError(
				`Permission denied for ${node}. Install the udev rules (see install.sh) and re-plug the receiver.`,
				{ cause: error },
			);
		}
		throw error;
	}
}

export { REPORT_LENGTH };
