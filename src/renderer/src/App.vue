<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Zap, Info, MousePointer2 } from 'lucide-vue-next';

import Dashboard from './components/Dashboard.vue';
import BatteryIndicator from './components/widgets/BatteryIndicator.vue';
import ToastStack from './components/widgets/ToastStack.vue';
import StatusMessage from './components/StatusMessage.vue';
import BaseButton from './components/BaseButton.vue';
import { useToast } from './composables/useToast';
import { useI18n } from 'vue-i18n';
import packageInfo from '../../../package.json';

const version = packageInfo.version;
const isConnected = ref(false);
const deviceModel = ref<'AJ159P' | 'AJ159Pro'>('AJ159P');
const batteryLevel = ref(-1);
const { toasts, removeToast } = useToast();
const { t, locale } = useI18n();
const connectionError = ref('');

const isPermissionError = computed(() => {
	const msg = connectionError.value.toLowerCase();
	return msg.includes('permission') || msg.includes('eacces') || msg.includes('access');
});

const connect = async () => {
	connectionError.value = '';
	try {
		if (!window.api) throw new Error('IPC API not found.');
		const result = await window.api.connectDevice({});
		if (result.success) {
			await finalizeConnection();
		} else {
			connectionError.value = result.error || 'Unknown error';
		}
	} catch (err: unknown) {
		const error = err instanceof Error ? err : new Error(String(err));
		console.error('IPC Error:', error);
		connectionError.value = `Connection Error: ${error.message}`;
	}
};

const finalizeConnection = async () => {
	isConnected.value = true;
	const model = await window.api.getDeviceModel();
	deviceModel.value = model;
	await updateBattery();
};

const updateBattery = async () => {
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
			batteryLevel.value = level;
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
			const result = await window.api.connectDevice({});
			if (result.success) {
				await finalizeConnection();
			} else if (result.error) {
				connectionError.value = result.error;
			}
		}
	} catch {
		// silently fail — manual connect is available
	}
});
</script>

<template>
	<div class="flex flex-col h-full">
		<!-- Top header bar -->
		<header
			class="flex items-center gap-4 px-6 py-2 bg-[var(--sidebar-bg)] border-b border-[var(--sidebar-border)] flex-shrink-0"
		>
			<div class="flex items-center gap-2">
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
					{{ $t('overview.wireless') }}
				</span>
			</div>

			<div class="flex-1" />

			<div v-if="isConnected" class="hidden sm:block">
				<BatteryIndicator :level="batteryLevel" :connected="isConnected" />
			</div>
			<span class="text-[10px] text-[var(--sidebar-text-dim)]">v{{ version }}</span>
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

				<div class="yaru-enter yaru-enter-3 w-full max-w-sm">
					<button
						@click="connect"
						class="bg-[var(--connection-card-bg)] hover:bg-[var(--connection-card-hover)] hover:border-[#E95420]/60 hover:-translate-y-1 p-5 rounded-xl border border-[var(--connection-card-border)] transition-all group flex flex-col items-center w-full"
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
				</div>

				<div v-if="connectionError" class="mt-6 w-full max-w-sm space-y-3">
					<StatusMessage :message="connectionError" type="error" />
					<div
						v-if="isPermissionError"
						class="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] p-3 rounded-lg"
					>
						{{ $t('connection.udevTip') }}
					</div>
					<BaseButton @click="connect" variant="green" class="w-full" aria-label="Retry connection">
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
				:isConnected="isConnected"
				:deviceModel="deviceModel"
				:batteryLevel="batteryLevel"
				@reset-complete="isConnected = false"
			/>

			<ToastStack :toasts="toasts" @remove="removeToast" />
		</main>
	</div>
</template>
