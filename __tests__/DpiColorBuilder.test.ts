import { describe, expect, it } from 'bun:test';
import { DpiColorBuilder, DEFAULT_DPI_COLORS } from '../src/main/driver/protocols/DpiColorBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

describe('DpiColorBuilder', () => {
	describe('build()', () => {
		it('matches the factory-colours golden vector', () => {
			expect(
				new DpiColorBuilder({
					colors: [...DEFAULT_DPI_COLORS] as [string, string, string, string, string, string],
				}).toString(),
			).toBe('0004000112ff000000ff000000ffffff0000ffffff00ff000000000000000000f7');
		});

		it('matches the all-white golden vector', () => {
			const white = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] as [
				string,
				string,
				string,
				string,
				string,
				string,
			];
			expect(new DpiColorBuilder({ colors: white }).toString()).toBe(
				'0004000112ffffffffffffffffffffffffffffffffffff000000000000000000ee',
			);
		});

		it('setColor updates a single stage', () => {
			const builder = new DpiColorBuilder().setColor(1, '#ffffff');
			const packet = builder.build();
			expect(packet.subarray(5, 8).toString('hex')).toBe('ffffff');
		});
	});

	describe('validation', () => {
		it('rejects non-six colour arrays', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiColorBuilder({ colors: ['#ffffff'] })).toThrow(ParamsError);
		});

		it('rejects malformed colours', () => {
			expect(() => new DpiColorBuilder().setColor(1, 'nope')).toThrow(ParamsError);
		});

		it('rejects stages outside 1..6', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new DpiColorBuilder().setColor(0, '#ffffff')).toThrow(ParamsError);
		});
	});
});
