import { describe, expect, it } from 'bun:test';
import {
	QUERY_DPI_TABLE,
	buildQuery,
	parseDeviceInfoReply,
	parseDpiTableReply,
	parseLedModeReply,
} from '../src/main/driver/protocols/Queries.js';
import { ParamsError } from '../src/main/driver/index.js';

/** Live 0x13 reply captured from an AJ159P (stage 2 active, nibble 6). */
const LIVE_DPI_REPLY = Buffer.from('13000119161000100020002000300030004000400080008000e800e80000000026', 'hex');

describe('Queries', () => {
	describe('buildQuery()', () => {
		it('builds a 33-byte query report', () => {
			const packet = buildQuery(QUERY_DPI_TABLE);
			expect(packet.length).toBe(33);
			expect(packet[1]).toBe(0x13);
			expect(packet[0]).toBe(0x00);
		});

		it('rejects bad query IDs', () => {
			expect(() => buildQuery(0x1ff)).toThrow(ParamsError);
		});
	});

	describe('parseDpiTableReply()', () => {
		it('decodes the live AJ159P reply (x100 scale, nibble 6)', () => {
			const table = parseDpiTableReply(LIVE_DPI_REPLY);
			expect(table.activeStage).toBe(1);
			expect(table.flagsNibble).toBe(6);
			expect(table.x.map((v) => v * 100)).toEqual([1600, 3200, 4800, 6400, 12800, 23200]);
			expect(table.y).toEqual(table.x);
		});

		it('rejects non-DPI replies', () => {
			expect(() => parseDpiTableReply(Buffer.alloc(33, 0))).toThrow(ParamsError);
		});
	});

	describe('parseDeviceInfoReply()', () => {
		it('decodes the live AJ159P reply (M620, battery 96)', () => {
			const info = parseDeviceInfoReply(
				Buffer.from('1000010b4d36323084019501006001000000000000000000000000000000000061', 'hex'),
			);
			expect(info.devId).toBe('M620');
			expect(info.battery).toBe(96);
		});

		it('rejects non-device-info replies', () => {
			expect(() => parseDeviceInfoReply(Buffer.alloc(33, 0))).toThrow(ParamsError);
		});
	});

	describe('parseLedModeReply()', () => {
		it('decodes the off opcode', () => {
			const reply = Buffer.from('150001010000000000000000000000000000000000000000000000000000000001', 'hex');
			expect(parseLedModeReply(reply)).toEqual({ mode: 'off', brightness: 0, speed: 0 });
		});

		it('decodes effect opcodes with brightness/speed nibbles', () => {
			// Shape mirrors settled Ajazzy captures: opcode + payload[1] nibbles.
			const breathing = Buffer.from('1500011802420000000000000000000000000000000000000000000000000000d9', 'hex');
			expect(parseLedModeReply(breathing)).toEqual({ mode: 'breathing', brightness: 4, speed: 2 });
		});

		it('rejects unknown opcodes', () => {
			const reply = Buffer.from('150001ff4200000000000000000000000000000000000000000000000000000098', 'hex');
			expect(() => parseLedModeReply(reply)).toThrow(ParamsError);
		});
	});
});
