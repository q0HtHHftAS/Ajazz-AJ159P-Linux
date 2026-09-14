import { describe, expect, it } from 'bun:test';
import { KeyTableBuilder } from '../src/main/driver/protocols/KeyTableBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

/** Live 0x11 reply captured from an AJ159P (factory button mapping). */
const LIVE_KEY_REPLY = Buffer.from('110001121001001002001004001008001010004001000000000000000000000000b0', 'hex');

describe('KeyTableBuilder', () => {
	describe('fromQueryReply()', () => {
		it('parses the live factory reply', () => {
			const slots = KeyTableBuilder.fromQueryReply(LIVE_KEY_REPLY).getSlots();
			expect(slots[0]).toEqual([0x10, 0x01, 0x00]);
			expect(slots[4]).toEqual([0x10, 0x10, 0x00]);
			expect(slots[5]).toEqual([0x40, 0x01, 0x00]);
		});

		it('rejects non-key-table replies', () => {
			expect(() => KeyTableBuilder.fromQueryReply(Buffer.alloc(33, 0))).toThrow(ParamsError);
		});
	});

	describe('build()', () => {
		it('matches the slot-4-mute golden vector', () => {
			const packet = KeyTableBuilder.fromQueryReply(LIVE_KEY_REPLY).setSlotPreset(4, 'mute').build();
			expect(packet.toString('hex')).toBe('000900010f10010010020010040010080080e200400100000000000000000000f2');
		});

		it('encodes native, consumer and keyboard presets', () => {
			const builder = KeyTableBuilder.fromQueryReply(LIVE_KEY_REPLY);
			builder.setSlotPreset(3, 'left');
			expect(builder.getSlots()[3]).toEqual([0x10, 0x01, 0x00]);
			builder.setSlotPreset(3, 'vol-up');
			expect(builder.getSlots()[3]).toEqual([0x80, 0xe9, 0x00]);
			builder.setSlotPreset(3, 'copy');
			expect(builder.getSlots()[3]).toEqual([0x70, 0x01, 0x06]);
			builder.setSlotDefault(3);
			expect(builder.getSlots()[3]).toEqual([0x10, 0x08, 0x00]);
		});
	});

	describe('matchPreset()', () => {
		it('recognizes default, native and special presets', () => {
			expect(KeyTableBuilder.matchPreset(0, 0x10, 0x01, 0x00)).toBe('default');
			expect(KeyTableBuilder.matchPreset(3, 0x10, 0x01, 0x00)).toBe('left');
			expect(KeyTableBuilder.matchPreset(4, 0x80, 0xe2, 0x00)).toBe('mute');
			expect(KeyTableBuilder.matchPreset(0, 0x70, 0x01, 0x19)).toBe('paste');
			expect(KeyTableBuilder.matchPreset(0, 0x99, 0x00, 0x00)).toBe('custom');
		});
	});

	describe('validation', () => {
		it('rejects slots outside 0..4 and unknown presets', () => {
			const builder = KeyTableBuilder.fromQueryReply(LIVE_KEY_REPLY);
			expect(() => builder.setSlotPreset(5, 'mute')).toThrow(ParamsError);
			// @ts-expect-error test — deliberate invalid call
			expect(() => builder.setSlotPreset(0, 'dpi-cycle')).toThrow(ParamsError);
		});
	});
});
