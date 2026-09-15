<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Zap, Cable, Info, MousePointer2, RotateCw } from 'lucide-vue-next';

import Dashboard from './components/Dashboard.vue';
import BatteryIndicator from './components/widgets/BatteryIndicator.vue';
import ToastStack from './components/widgets/ToastStack.vue';
import StatusMessage from './components/StatusMessage.vue';
import BaseButton from './components/BaseButton.vue';
import { useToast } from './composables/useToast';
import { useI18n } from 'vue-i18n';
import packageInfo from '../../../package.json';
import ajazzLogo from './assets/ajazz.svg';

const version = packageInfo.version;
const isConnected = ref(false);
const deviceModel = ref<'AJ159P' | 'AJ159Pro'>('AJ159P');
const connectionKind = ref<'wireless' | 'wired'>('wireless');
const availableKinds = ref<('wireless' | 'wired')[]>([]);
const switching = ref(false);
const batteryLevel = ref(-1);
// Guards overlapping connects (manual + hot-plug poll).
const busy = ref(false);
// Dashboard remount key part + whether the fresh mount may auto-sync.
const refreshTick = ref(0);
const pendingSync = ref(true);
// Set by the manual refresh button; the next Dashboard 'refreshed' toasts.
const expectRefresh = ref(false);
const { toasts, removeToast, success: toastSuccess, error: toastError, info: toastInfo } = useToast();
const { t, locale } = useI18n();
const connectionError = ref('');
// App update state fed by the main process (production builds only).
const updateState = ref<{ status: string; percent?: number; version?: string; message?: string } | null>(null);

const quitAndInstall = () => {
	void window.api.quitAndInstall().catch(() => undefined);
};

// True while waiting for the result of a manual (clicked) update check,
// so only those surface toasts — background-check failures stay quiet.
const manualCheck = ref(false);

const checkManually = async () => {
	manualCheck.value = true;
	toastInfo(t('update.checking'));
	try {
		const result = await window.api.checkForUpdates();
		if (!result.success) {
			manualCheck.value = false;
			toastError(result.error || t('update.failedRetry'));
		}
		// On success the outcome arrives via onUpdateStatus below.
	} catch (err: unknown) {
		manualCheck.value = false;
		const error = err instanceof Error ? err : new Error(String(err));
		toastError(error.message);
	}
};

const isPermissionError = computed(() => {
	const msg = connectionError.value.toLowerCase();
	return msg.includes('permission') || msg.includes('eacces') || msg.includes('access');
});

const connect = async (kind: 'wireless' | 'wired') => {
	await doConnect(kind, true);
};

/** Shared connect flow for manual, auto and hot-plug connects. */
const doConnect = async (kind: 'wireless' | 'wired', sync: boolean): Promise<boolean> => {
	if (busy.value) return false;
	busy.value = true;
	connectionError.value = '';
	try {
		if (!window.api) throw new Error('IPC API not found.');
		const result = await window.api.connectDevice({ kind });
		if (result.success) {
			pendingSync.value = sync;
			refreshTick.value++;
			await finalizeConnection();
			return true;
		}
		connectionError.value = result.error || 'Unknown error';
		return false;
	} catch (err: unknown) {
		const error = err instanceof Error ? err : new Error(String(err));
		console.error('IPC Error:', error);
		connectionError.value = `Connection Error: ${error.message}`;
		return false;
	} finally {
		busy.value = false;
	}
};

const finalizeConnection = async () => {
	isConnected.value = true;
	const model = await window.api.getDeviceModel();
	deviceModel.value = model;
	try {
		connectionKind.value = await window.api.getConnectionKind();
	} catch {
		connectionKind.value = 'wireless';
	}
	await refreshDevices();
	await updateBattery();
};

const refreshDevices = async () => {
	try {
		const list = await window.api.detectDevices();
		if (Array.isArray(list) && list.length > 0) {
			availableKinds.value = [...new Set(list.map((d) => (d.kind === 'wired' ? 'wired' : 'wireless')))];
			return;
		}
	} catch {
		// fall through to single-device fallback below
	}
	try {
		const detection = await window.api.detectDevice();
		availableKinds.value = detection.detected ? [detection.kind === 'wired' ? 'wired' : 'wireless'] : [];
	} catch {
		availableKinds.value = [];
	}
};

const otherKind = computed(() => (connectionKind.value === 'wired' ? 'wireless' : 'wired'));
const canSwitch = computed(() => availableKinds.value.includes(otherKind.value));

const switchConnection = async () => {
	if (switching.value || !canSwitch.value) return;
	switching.value = true;
	try {
		await doConnect(otherKind.value, true);
	} finally {
		switching.value = false;
	}
};

/** Manual header refresh: re-read devices, battery and the full hardware state. */
const refreshAll = async () => {
	if (!isConnected.value || busy.value) return;
	expectRefresh.value = true;
	pendingSync.value = false;
	refreshTick.value++;
	await refreshDevices();
	await updateBattery();
};

const onDashboardRefreshed = () => {
	if (!expectRefresh.value) return;
	expectRefresh.value = false;
	toastSuccess(t('connection.refreshed'));
};

/** Quietly drop to the connect screen after the device is unplugged. */
const disconnectQuiet = async () => {
	try {
		await window.api.disconnectDevice();
	} catch {
		// best effort — the node is gone anyway
	}
	isConnected.value = false;
	batteryLevel.value = -1;
	toastError(t('connection.disconnected'));
};

/** Hot-plug poll (sysfs only, no radio wake): auto-connect, follow mode changes. */
const emptyPolls = ref(0);

const pollDevices = async () => {
	if (busy.value || switching.value || !window.api) return;
	let kinds: ('wireless' | 'wired')[] = [];
	try {
		const list = await window.api.detectDevices();
		if (Array.isArray(list)) kinds = list.map((d) => (d.kind === 'wired' ? 'wired' : 'wireless'));
	} catch {
		return;
	}
	if (kinds.length > 0) emptyPolls.value = 0;
	if (!isConnected.value) {
		// Auto-connect on plug-in — but never fight a manual error state.
		if (kinds.length > 0 && !connectionError.value) {
			const kind = kinds[0] ?? 'wireless';
			if (await doConnect(kind, true)) toastSuccess(t('connection.connected'));
		}
		return;
	}
	if (kinds.length === 0) {
		// Debounce: one empty poll can be a transient sysfs blip or a loose
		// receiver — only drop the UI after two in a row (4s).
		emptyPolls.value++;
		if (emptyPolls.value < 2) return;
		emptyPolls.value = 0;
		await disconnectQuiet();
		return;
	}
	// Live device list: keeps the mode-switch button accurate without needing focus.
	if (kinds.length !== availableKinds.value.length || kinds.some((k) => !availableKinds.value.includes(k))) {
		availableKinds.value = [...new Set(kinds)];
	}
	if (!kinds.includes(connectionKind.value)) {
		// Current mode unplugged while the other is present — follow it.
		await doConnect(kinds[0] ?? 'wireless', true);
	}
};

const handleFocus = async () => {
	// Sequential so the device list settles before the battery query runs.
	await refreshDevices();
	if (isConnected.value) void updateBattery();
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

const updateBattery = async () => {
	// Wired USB mode has no battery — skip the query entirely.
	if (connectionKind.value === 'wired') {
		batteryLevel.value = -1;
		return;
	}
	try {
		batteryLevel.value = await window.api.getBattery();
	} catch (err) {
		console.warn('Battery update timed out or failed:', err);
		batteryLevel.value = -1;
	}
};

onMounted(async () => {
	localStorage.removeItem('theme');
	document.documentElement.className = '';

	try {
		window.api.onBatteryUpdated((level: number) => {
			if (connectionKind.value === 'wired') return;
			batteryLevel.value = level;
		});

		window.api.onUpdateStatus((s) => {
			if (s.status === 'downloaded') {
				manualCheck.value = false;
				updateState.value = s;
				toastSuccess(t('update.ready', { version: s.version ?? '' }));
			} else if (s.status === 'available' || s.status === 'progress') {
				updateState.value = s;
			} else if (s.status === 'none') {
				updateState.value = null;
				if (manualCheck.value) {
					manualCheck.value = false;
					toastInfo(t('update.latest'));
				}
			} else if (s.status === 'error') {
				updateState.value = s;
				if (manualCheck.value) {
					manualCheck.value = false;
					toastError(s.message || t('update.failedRetry'));
				}
			} else {
				updateState.value = null;
			}
		});

		await window.api.getSettings();
		// English only (language switcher removed)
		locale.value = 'en';
	} catch (err) {
		console.warn('App initialization skipped (API not available):', err);
	}

	try {
		const detection = await window.api.detectDevice();
		if (detection.detected) {
			await doConnect(detection.kind === 'wired' ? 'wired' : 'wireless', true);
		} else {
			await refreshDevices();
		}
	} catch {
		// silently fail — manual connect is available
	}

	// Live updates: hot-plug poll + cable plug/unplug on focus.
	pollTimer = setInterval(() => void pollDevices(), 2000);
	window.addEventListener('focus', handleFocus);
});

onUnmounted(() => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	window.removeEventListener('focus', handleFocus);
});
</script>

<template>
	<div class="flex flex-col h-full">
		<!-- Top header bar -->
		<header
			class="flex items-center gap-4 px-6 py-2 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex-shrink-0"
		>
			<div class="flex items-center gap-2">
				<img :src="ajazzLogo" alt="AJAZZ logo" class="h-6 w-auto invert" draggable="false" />
				<h1 class="text-lg font-bold tracking-wide whitespace-nowrap">
					<span class="text-[#E95420]">AJAZZ</span>
					<span class="text-[var(--text-primary)]"> AJ159P</span>
				</h1>
			</div>

			<div v-if="isConnected" class="yaru-enter flex items-center gap-2 text-xs">
				<span
					class="px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-card)] text-[var(--text-secondary)] font-medium"
				>
					AJAZZ {{ deviceModel === 'AJ159Pro' ? 'AJ159 Pro' : 'AJ159P' }}
				</span>
				<span
					class="px-2.5 py-1 rounded-full bg-[#E95420]/15 border border-[#E95420]/40 text-[#f9a88a] font-medium"
				>
					{{ connectionKind === 'wired' ? $t('connection.wired') : $t('overview.wireless') }}
				</span>
				<button
					v-if="canSwitch"
					@click="switchConnection"
					:disabled="switching"
					class="px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-card)] text-[var(--text-secondary)] font-medium hover:border-[#E95420]/60 hover:text-[var(--text-primary)] transition-all disabled:opacity-40"
					:title="
						connectionKind === 'wired' ? $t('connection.switchToWireless') : $t('connection.switchToWired')
					"
				>
					{{
						switching
							? '…'
							: connectionKind === 'wired'
								? $t('connection.switchToWireless')
								: $t('connection.switchToWired')
					}}
				</button>
			</div>

			<div class="flex-1" />

			<button
				v-if="updateState && (updateState.status === 'available' || updateState.status === 'progress')"
				class="hidden sm:block px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-card)] text-[var(--text-secondary)] text-xs font-medium cursor-default"
			>
				{{
					updateState.status === 'progress'
						? $t('update.downloading', { percent: updateState.percent ?? 0 })
						: $t('update.found', { version: updateState.version ?? '' })
				}}
			</button>
			<button
				v-else-if="updateState && updateState.status === 'downloaded'"
				@click="quitAndInstall"
				class="hidden sm:block px-2.5 py-1 rounded-full bg-[#E95420] hover:bg-[#C74416] text-white text-xs font-medium transition-all"
			>
				{{ $t('update.restart', { version: updateState.version ?? '' }) }}
			</button>
			<button
				v-else-if="updateState && updateState.status === 'error'"
				@click="checkManually"
				class="hidden sm:block px-2.5 py-1 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-xs font-medium transition-all"
				:title="updateState.message"
			>
				{{ $t('update.failedRetry') }}
			</button>

			<div v-if="isConnected" class="hidden sm:flex items-center gap-2">
				<button
					@click="refreshAll"
					:disabled="busy"
					class="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all disabled:opacity-40"
					:title="$t('connection.refreshNow')"
					aria-label="Refresh device state"
				>
					<RotateCw class="w-4 h-4" :class="busy ? 'animate-spin' : ''" />
				</button>
				<BatteryIndicator :level="batteryLevel" :connected="isConnected" :kind="connectionKind" />
			</div>
			<button
				@click="checkManually"
				class="text-[10px] text-[var(--sidebar-text-dim)] hover:text-[var(--text-secondary)] transition-colors"
				:title="$t('update.checkNow')"
			>
				v{{ version }}
			</button>
		</header>

		<!-- Main Content -->
		<main class="flex-1 min-h-0 overflow-hidden p-3 bg-[var(--bg-primary)]">
			<div
				v-if="!isConnected"
				class="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto px-4"
			>
				<div
					class="yaru-enter w-24 h-24 bg-[var(--bg-elevated)] rounded-full flex items-center justify-center mb-6"
				>
					<MousePointer2 class="w-12 h-12 text-[var(--text-muted)]" />
				</div>

				<h2 class="yaru-enter yaru-enter-1 text-2xl font-bold mb-2 text-[var(--text-primary)]">
					{{ $t('connection.title') }}
				</h2>
				<p class="yaru-enter yaru-enter-2 text-[var(--text-secondary)] mb-8 max-w-sm">
					{{ $t('connection.description') }}
				</p>

				<div class="yaru-enter yaru-enter-3 grid grid-cols-2 gap-4 w-full max-w-xl">
					<button
						@click="connect('wireless')"
						class="bg-[var(--connection-card-bg)] hover:bg-[var(--connection-card-hover)] hover:border-[#E95420]/60 hover:-translate-y-1 p-5 rounded-xl border border-[var(--connection-card-border)] transition-all group flex flex-col items-center"
						aria-label="Connect via 2.4GHz wireless receiver"
					>
						<Zap
							class="w-8 h-8 mb-3 text-[var(--connection-card-text)] group-hover:text-[#E95420] transition-colors"
						/>
						<span class="block font-semibold text-[var(--text-primary)]">{{
							$t('connection.adapter')
						}}</span>
						<span class="block text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{{
							$t('connection.adapterDesc')
						}}</span>
					</button>
					<button
						@click="connect('wired')"
						class="bg-[var(--connection-card-bg)] hover:bg-[var(--connection-card-hover)] hover:border-[#E95420]/60 hover:-translate-y-1 p-5 rounded-xl border border-[var(--connection-card-border)] transition-all group flex flex-col items-center"
						aria-label="Connect via USB cable"
					>
						<Cable
							class="w-8 h-8 mb-3 text-[var(--connection-card-text)] group-hover:text-[#E95420] transition-colors"
						/>
						<span class="block font-semibold text-[var(--text-primary)]">{{ $t('connection.wired') }}</span>
						<span class="block text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{{
							$t('connection.wiredDesc')
						}}</span>
					</button>
				</div>

				<div v-if="connectionError" class="mt-6 w-full max-w-sm space-y-3">
					<StatusMessage :message="connectionError" type="error" />
					<div
						v-if="isPermissionError"
						class="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] p-3 rounded-lg"
					>
						{{ $t('connection.udevTip') }}
					</div>
					<BaseButton
						@click="connect(connectionKind)"
						variant="green"
						class="w-full"
						aria-label="Retry connection"
					>
						{{ $t('connection.retry') }}
					</BaseButton>
				</div>

				<button
					@click="window.location.reload()"
					class="mt-8 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1 transition-colors"
					aria-label="Force refresh the application"
				>
					<Info class="w-3 h-3" /> {{ $t('connection.forceRefresh') }}
				</button>
			</div>

			<Dashboard
				v-else
				:key="`${connectionKind}:${refreshTick}`"
				:isConnected="isConnected"
				:deviceModel="deviceModel"
				:connectionKind="connectionKind"
				:batteryLevel="batteryLevel"
				:syncOnMount="pendingSync"
				@reset-complete="isConnected = false"
				@refreshed="onDashboardRefreshed"
			/>

			<ToastStack :toasts="toasts" @remove="removeToast" />
		</main>
	</div>
</template>
