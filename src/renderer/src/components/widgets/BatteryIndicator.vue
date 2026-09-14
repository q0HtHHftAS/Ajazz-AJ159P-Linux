<script setup lang="ts">
import { computed } from 'vue';
import { Zap } from 'lucide-vue-next';

const props = withDefaults(
	defineProps<{
		level: number;
		connected: boolean;
		kind?: 'wireless' | 'wired';
		/** Cable plugged in while on wireless (both dongle + USB present). */
		charging?: boolean;
	}>(),
	{ level: -1, connected: false, kind: 'wireless', charging: false },
);

const percent = computed(() => Math.max(0, Math.min(100, props.level)));
const isFull = computed(() => props.connected && props.kind === 'wireless' && props.level >= 100);
const isChargingCable = computed(() => props.connected && props.kind === 'wired');
const isChargingWireless = computed(() => props.connected && props.kind === 'wireless' && props.charging);

// iOS-like: white fill, red when low, green while charging or full.
const fillColor = computed(() => {
	if (isChargingCable.value || isChargingWireless.value || isFull.value) return 'bg-green-500';
	if (percent.value <= 20) return 'bg-red-500';
	return 'bg-white';
});
</script>

<template>
	<div class="flex items-center gap-2">
		<template v-if="isChargingCable">
			<!-- Cable only: no percentage exists — live charging art instead -->
			<div
				class="relative w-10 h-5 rounded-[6px] border border-white/40 p-[2px]"
				:title="$t('connection.wiredCharging')"
			>
				<div class="h-full w-2/3 rounded-[3px] bg-green-500/80 animate-pulse" />
				<Zap class="absolute inset-0 m-auto w-3 h-3 text-white animate-pulse" fill="currentColor" />
			</div>
			<span class="text-xs font-medium text-[var(--sidebar-text-footer)]">{{ $t('connection.charging') }}</span>
		</template>
		<template v-else-if="connected && level >= 0">
			<!-- iOS-style battery: slim shell, cap nub, bolt badge while charging -->
			<div class="relative flex items-center">
				<div class="relative w-10 h-5 rounded-[6px] border border-white/40 p-[2px]">
					<div
						class="h-full rounded-[3px] transition-all duration-700 ease-out"
						:class="fillColor"
						:style="{ width: `${percent}%` }"
					/>
					<Zap
						v-if="isChargingWireless"
						class="absolute inset-0 m-auto w-3 h-3 text-white animate-pulse"
						fill="currentColor"
					/>
				</div>
				<div class="w-[2.5px] h-[9px] ml-[1.5px] rounded-r-full bg-white/40" />
			</div>
			<span class="text-sm font-medium tabular-nums text-[var(--sidebar-text-footer)]">{{ level }}%</span>
		</template>
		<template v-else-if="connected">
			<!-- Wireless: waiting for the first battery frame from the mouse -->
			<div
				class="relative w-10 h-5 rounded-[6px] border border-white/40 p-[2px]"
				title="Waiting for battery reading — move or wake the mouse"
			>
				<div class="h-full w-full rounded-[3px] bg-white/20 animate-pulse" />
			</div>
			<span class="text-sm font-medium tabular-nums text-[var(--sidebar-text-footer)]">…</span>
		</template>
		<template v-else>
			<!-- Disconnected -->
			<div class="w-10 h-5 rounded-[6px] border border-white/20 p-[2px] opacity-30">
				<div class="h-full w-0 rounded-[3px]" />
			</div>
			<span class="text-xs text-[var(--sidebar-text-muted)] italic">Disconnected</span>
		</template>
	</div>
</template>
