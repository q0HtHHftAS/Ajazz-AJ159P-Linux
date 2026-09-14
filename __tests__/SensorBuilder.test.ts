import { describe, expect, it } from 'bun:test';
import { SensorBuilder } from '../src/main/driver/protocols/SensorBuilder.js';
import { ParamsError } from '../src/main/driver/index.js';

/** Live 0x17 reply captured from an AJ159P (sleep 5min, lift-off 0, idle-light 0). */
const LIVE_SENSOR_REPLY = Buffer.from('170001051e0000080000000000000000000000000000000000000000000000000026', 'hex');

describe('SensorBuilder', () => {
	describe('fromQueryReply()', () => {
		it('parses the live reply', () => {
			const settings = SensorBuilder.fromQueryReply(LIVE_SENSOR_REPLY).getSettings();
			expect(settings).toEqual({ sleepMinutes: 5, liftOff: 0, idleLightOff: 0 });
		});

		it('rejects non-sensor replies', () => {
			expect(() => SensorBuilder.fromQueryReply(Buffer.alloc(33, 0))).toThrow(ParamsError);
		});
	});

	describe('build()', () => {
		it('matches the 10-minute golden vector (other bytes preserved)', () => {
			const packet = SensorBuilder.fromQueryReply(LIVE_SENSOR_REPLY).setSleepMinutes(10).build();
			expect(packet.toString('hex')).toBe('00070001043c000008000000000000000000000000000000000000000000000044');
		});

		it('round-trips the live reply unchanged by default', () => {
			const packet = SensorBuilder.fromQueryReply(LIVE_SENSOR_REPLY).setSleepMinutes(5).build();
			// Same sleep value back: payload bytes identical to the live state.
			expect(packet[5]).toBe(0x1e);
			expect(packet[6]).toBe(0x00);
			expect(packet[7]).toBe(0x00);
			expect(packet[8]).toBe(0x08);
		});
	});

	describe('validation', () => {
		it('rejects out-of-range sleep times', () => {
			expect(() => SensorBuilder.fromQueryReply(LIVE_SENSOR_REPLY).setSleepMinutes(500)).toThrow(ParamsError);
		});
	});
});
