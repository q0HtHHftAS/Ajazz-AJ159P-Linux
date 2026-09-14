import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAjazzReceivers } from '../src/main/driver/core/HidrawTransport.js';

const WIRELESS_UEVENT = 'DRIVER=hid-generic\nHID_ID=0003:0000249A:00005C2F\nHID_NAME=XCTECH Wireless-Receiver\n';
const WIRED_UEVENT = 'DRIVER=hid-generic\nHID_ID=0003:0000248A:00005C2E\nHID_NAME=XCTECH AJAZZ AJ159 Mouse\n';

describe('findAjazzReceivers', () => {
	let root: string;
	let sysfs: string;
	let dev: string;

	const addNode = (name: string, uevent: string, iface: string): void => {
		const dir = join(sysfs, name, 'device');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'uevent'), uevent);
		// Fake the resolved USB interface path (must contain `:1.2/` for MI_02).
		const target = join(root, 'bus', `${name}-${iface}`, 'dev');
		mkdirSync(target, { recursive: true });
		writeFileSync(join(dev, name), '');
		// Replace the device dir with a symlink to the fake interface path.
		rmSync(dir, { recursive: true });
		symlinkSync(target, dir);
		// uevent must stay readable through the symlink.
		writeFileSync(join(dir, 'uevent'), uevent);
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'hidraw-test-'));
		sysfs = join(root, 'sys');
		dev = join(root, 'dev');
		mkdirSync(sysfs, { recursive: true });
		mkdirSync(dev, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns empty when sysfs is missing', () => {
		expect(findAjazzReceivers(join(root, 'nope'), dev)).toEqual([]);
	});

	it('finds the wireless MI_02 node and ignores MI_00', () => {
		addNode('hidraw0', WIRELESS_UEVENT, '3-3:1.0');
		addNode('hidraw2', WIRELESS_UEVENT, '3-3:1.2');
		const found = findAjazzReceivers(sysfs, dev);
		expect(found).toEqual([{ node: join(dev, 'hidraw2'), kind: 'wireless' }]);
	});

	it('finds the wired MI_02 node', () => {
		addNode('hidraw0', WIRED_UEVENT, '3-3:1.0');
		addNode('hidraw1', WIRED_UEVENT, '3-3:1.2');
		const found = findAjazzReceivers(sysfs, dev);
		expect(found).toEqual([{ node: join(dev, 'hidraw1'), kind: 'wired' }]);
	});

	it('prefers wireless when both are plugged in', () => {
		addNode('hidraw0', WIRED_UEVENT, '3-3:1.2');
		addNode('hidraw1', WIRELESS_UEVENT, '3-3:1.2');
		const found = findAjazzReceivers(sysfs, dev);
		expect(found.map((r) => r.kind)).toEqual(['wireless', 'wired']);
	});

	it('skips nodes missing from dev', () => {
		addNode('hidraw9', WIRELESS_UEVENT, '3-3:1.2');
		rmSync(join(dev, 'hidraw9'));
		expect(findAjazzReceivers(sysfs, dev)).toEqual([]);
	});
});
