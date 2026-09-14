import { describe, expect, it } from 'bun:test';
import { RgbBuilder } from '../src/main/driver/protocols/RgbBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

describe('RgbBuilder', () => {
	describe('build()', () => {
		it('matches the off golden vector', () => {
			expect(new RgbBuilder({ mode: 'off' }).toString()).toBe(
				'000500010200420000000000000000000000000000000000000000000000000042',
			);
		});

		it('matches the static-red golden vector', () => {
			expect(new RgbBuilder({ mode: 'static', color: '#ff0000', brightness: 4, speed: 2 }).toString()).toBe(
				'00050001050342ff00000000000000000000000000000000000000000000000044',
			);
		});

		it('matches the breathing golden vector', () => {
			expect(new RgbBuilder({ mode: 'breathing', color: '#8b5cf6', brightness: 4, speed: 2 }).toString()).toBe(
				'0005000118024207ff000000ff000000ff00ffffffff00ff00ffffffff0000003f',
			);
		});

		it('matches the dim static-green golden vector', () => {
			expect(new RgbBuilder({ mode: 'static', color: '#00ff00', brightness: 0, speed: 0 }).toString()).toBe(
				'0005000105030000ff000000000000000000000000000000000000000000000002',
			);
		});

		it('produces 33-byte reports with a valid checksum', () => {
			const packet = new RgbBuilder({ mode: 'static', color: '#123456' }).build();
			expect(packet.length).toBe(33);
			const checksum = packet.subarray(5, 32).reduce((acc, byte) => acc + byte, 0) & 0xff;
			expect(packet[32]).toBe(checksum);
		});
	});

	describe('validation', () => {
		it('rejects unknown modes', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new RgbBuilder({ mode: 'rainbow' })).toThrow(ParamsError);
		});

		it('rejects malformed colours', () => {
			expect(() => new RgbBuilder({ color: 'red' })).toThrow(ParamsError);
			expect(() => new RgbBuilder({ color: '#fff' })).toThrow(ParamsError);
		});

		it('rejects brightness/speed outside 0..4', () => {
			expect(() => new RgbBuilder({ brightness: 5 })).toThrow(ParamsError);
			expect(() => new RgbBuilder({ speed: -1 })).toThrow(ParamsError);
		});
	});
});
