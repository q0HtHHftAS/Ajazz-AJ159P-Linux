import { describe, expect, it } from 'bun:test';
import { DpiBuilder, DEFAULT_DPI_VALUES } from '../src/main/driver/protocols/DpiBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

describe('DpiBuilder', () => {
	describe('build()', () => {
		it('matches the factory-default golden vector', () => {
			const builder = new DpiBuilder({
				selected: 2,
				values: [...DEFAULT_DPI_VALUES] as [number, number, number, number, number, number],
			});
			expect(builder.toString()).toBe('0003000125161000100020002000300030004000400080008000e800e800000026');
		});

		it('matches the stage-3 custom golden vector', () => {
			const builder = new DpiBuilder({ selected: 3, values: [400, 800, 1600, 3200, 6400, 26000] });
			expect(builder.toString()).toBe('000300012526040004000800080010001000200020004000400004010401000028');
		});

		it('produces 33-byte reports with a valid checksum', () => {
			const packet = new DpiBuilder({ selected: 6, values: [100, 100, 100, 100, 100, 100] }).build();
			expect(packet.length).toBe(33);
			expect(packet.toString('hex')).toBe('000300012556010001000100010001000100010001000100010001000100000062');
			const checksum = packet.subarray(5, 32).reduce((acc, byte) => acc + byte, 0) & 0xff;
			expect(packet[32]).toBe(checksum);
		});

		it('encodes the selected stage in the high nibble of byte 5', () => {
			expect(new DpiBuilder({ selected: 1 }).build()[5]).toBe(0x06);
			expect(new DpiBuilder({ selected: 6 }).build()[5]).toBe(0x56);
		});
	});

	describe('validation', () => {
		it('rejects stages outside 1..6', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder({ selected: 0 })).toThrow(ParamsError);
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder({ selected: 7 })).toThrow(ParamsError);
		});

		it('rejects DPI values outside 100..26000 or off-step', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder({ values: [0, 800, 800, 800, 800, 800] })).toThrow(ParamsError);
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder({ values: [801, 800, 800, 800, 800, 800] })).toThrow(ParamsError);
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder({ values: [800, 800, 800, 800, 800, 26001] })).toThrow(ParamsError);
		});

		it('rejects setValue with a bad stage', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiBuilder().setValue(9, 800)).toThrow(ParamsError);
		});
	});
});
