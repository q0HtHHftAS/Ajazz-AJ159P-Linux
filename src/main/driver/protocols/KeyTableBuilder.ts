import { ParamsError } from '../errors.js';
import { REPORT_LENGTH } from '../types.js';

/**
 * Report header for the button-mapping packet (family 09, SET, opcode 0F).
 * The 27-byte payload is nine 3-byte slots; only slots 0-4 map to physical
 * buttons. Always read-modify-write (see `fromQueryReply`) — slots 5-8
 * stay at their constant factory bytes.
 */
const KEY_TABLE_HEADER = [0x00, 0x09, 0x00, 0x01, 0x0f] as const;

/** Remappable slots (0-based): left, right, middle, forward, backward. */
export const KEY_SLOT_COUNT = 5;

/** Total slots in the payload (5 buttons + 4 constant trailer slots). */
export const KEY_TABLE_SLOTS = 9;

/** Native button flags, indexed by slot/button (left, right, middle, forward, backward). */
const NATIVE_FLAGS = [0x01, 0x02, 0x04, 0x08, 0x10] as const;

export type NativeButton = 'left' | 'right' | 'middle' | 'forward' | 'backward';

/** Preset IDs offered by the UI. */
export type ButtonPresetId = NativeButton | 'vol-up' | 'vol-down' | 'mute' | 'play-pause' | 'copy' | 'paste';

const CONSUMER_PRESETS: Record<string, number> = {
	'vol-up': 0x00e9,
	'vol-down': 0x00ea,
	mute: 0x00e2,
	'play-pause': 0x00cd,
};

const KEYBOARD_PRESETS: Record<string, { modifiers: number; keycode: number }> = {
	// Ctrl+C / Ctrl+V (USB HID keyboard page usages 0x06 / 0x19).
	copy: { modifiers: 0x01, keycode: 0x06 },
	paste: { modifiers: 0x01, keycode: 0x19 },
};

export type KeySlot = [marker: number, lo: number, hi: number];

/**
 * Builds the button-mapping report for the AJ159P receiver.
 *
 * Slot encoding `[marker, lo, hi]`: native `[0x10, 1<<target, 0x00]`,
 * consumer `[0x80, usageLE]`, keyboard `[0x70, modifiers, usage]`.
 * Checksum = `sum(bytes[5..31]) & 0xff`.
 */
export class KeyTableBuilder {
	private slots: KeySlot[];

	private constructor(slots: KeySlot[]) {
		this.slots = slots.map((s) => [...s] as KeySlot);
	}

	/**
	 * Seeds a builder from a `0x11` query reply, preserving every slot
	 * (including the constant trailer) for read-modify-write.
	 */
	static fromQueryReply(reply: Buffer): KeyTableBuilder {
		if (reply.length < 31 || reply[0] !== 0x11 || reply[2] !== 0x01) {
			throw new ParamsError('reply', 'not a key-table (0x11) query reply');
		}
		const slots: KeySlot[] = [];
		for (let i = 0; i < KEY_TABLE_SLOTS; i++) {
			slots.push([reply[4 + i * 3] ?? 0, reply[5 + i * 3] ?? 0, reply[6 + i * 3] ?? 0]);
		}
		return new KeyTableBuilder(slots);
	}

	private checkSlot(slot: number): void {
		if (!Number.isInteger(slot) || slot < 0 || slot >= KEY_SLOT_COUNT) {
			throw new ParamsError('slot', `slot must be an integer between 0 and ${KEY_SLOT_COUNT - 1}`);
		}
	}

	setSlotPreset(slot: number, preset: ButtonPresetId): this {
		this.checkSlot(slot);
		const nativeIndex = (['left', 'right', 'middle', 'forward', 'backward'] as const).indexOf(
			preset as NativeButton,
		);
		if (nativeIndex >= 0) {
			this.slots[slot] = [0x10, NATIVE_FLAGS[nativeIndex] ?? 0, 0x00];
			return this;
		}
		const consumer = CONSUMER_PRESETS[preset];
		if (consumer !== undefined) {
			this.slots[slot] = [0x80, consumer & 0xff, (consumer >> 8) & 0xff];
			return this;
		}
		const keyboard = KEYBOARD_PRESETS[preset];
		if (keyboard !== undefined) {
			this.slots[slot] = [0x70, keyboard.modifiers, keyboard.keycode];
			return this;
		}
		throw new ParamsError('preset', `unknown button preset: ${preset}`);
	}

	/** Restores a slot to its factory default (`[0x10, 1<<slot, 0x00]`). */
	setSlotDefault(slot: number): this {
		this.checkSlot(slot);
		this.slots[slot] = [0x10, 1 << slot, 0x00];
		return this;
	}

	/** Matches a slot's bytes to a known preset ID, or `custom`/`default`. */
	static matchPreset(slot: number, marker: number, lo: number, hi: number): ButtonPresetId | 'default' | 'custom' {
		if (marker === 0x10 && lo === 1 << slot && hi === 0x00) return 'default';
		const nativeIndex = NATIVE_FLAGS.indexOf(lo as (typeof NATIVE_FLAGS)[number]);
		if (marker === 0x10 && hi === 0x00 && nativeIndex >= 0) {
			return (['left', 'right', 'middle', 'forward', 'backward'] as const)[nativeIndex] ?? 'custom';
		}
		if (marker === 0x80) {
			const usage = lo | (hi << 8);
			for (const [id, code] of Object.entries(CONSUMER_PRESETS)) {
				if (code === usage) return id as ButtonPresetId;
			}
		}
		if (marker === 0x70) {
			for (const [id, kb] of Object.entries(KEYBOARD_PRESETS)) {
				if (kb.modifiers === lo && kb.keycode === hi) return id as ButtonPresetId;
			}
		}
		return 'custom';
	}

	getSlots(): KeySlot[] {
		return this.slots.map((s) => [...s] as KeySlot);
	}

	build(): Buffer {
		const packet = Buffer.alloc(REPORT_LENGTH, 0);
		Buffer.from(KEY_TABLE_HEADER).copy(packet, 0);
		this.slots.forEach(([marker, lo, hi], i) => {
			packet[5 + i * 3] = marker;
			packet[6 + i * 3] = lo;
			packet[7 + i * 3] = hi;
		});
		packet[REPORT_LENGTH - 1] = packet.subarray(5, REPORT_LENGTH - 1).reduce((acc, byte) => acc + byte, 0) & 0xff;
		return packet;
	}

	toString(): string {
		return this.build().toString('hex');
	}
}
