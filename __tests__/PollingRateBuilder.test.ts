import { describe, expect, it } from 'bun:test';
import { PollingRateBuilder } from '../src/main/driver/protocols/PollingRateBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

describe('PollingRateBuilder', () => {
	describe('build()', () => {
		it('matches the 500Hz golden vector', () => {
			expect(new PollingRateBuilder({ rate: 500 }).toString()).toBe(
				'000200010102000000000000000000000000000000000000000000000000000002',
			);
		});

		it('matches the 1000Hz golden vector', () => {
			expect(new PollingRateBuilder({ rate: 1000 }).toString()).toBe(
				'000200010101000000000000000000000000000000000000000000000000000001',
			);
		});

		it('produces 33-byte reports with a valid checksum', () => {
			const packet = new PollingRateBuilder({ rate: 125 }).build();
			expect(packet.length).toBe(33);
			expect(packet[5]).toBe(8);
			const checksum = packet.subarray(5, 32).reduce((acc, byte) => acc + byte, 0) & 0xff;
			expect(packet[32]).toBe(checksum);
		});
	});

	describe('rateForInterval()', () => {
		it('decodes firmware intervals back to Hz', () => {
			expect(PollingRateBuilder.rateForInterval(8)).toBe(125);
			expect(PollingRateBuilder.rateForInterval(4)).toBe(250);
			expect(PollingRateBuilder.rateForInterval(2)).toBe(500);
			expect(PollingRateBuilder.rateForInterval(1)).toBe(1000);
			expect(PollingRateBuilder.rateForInterval(99)).toBeNull();
		});
	});

	describe('validation', () => {
		it('rejects unsupported rates', () => {
			// @ts-expect-error test — deliberate invalid call
			expect(() => new PollingRateBuilder({ rate: 2000 })).toThrow(ParamsError);
		});
	});
});
