<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		level: number;
		connected: boolean;
	}>(),
	{ level: -1, connected: false },
);

const percent = computed(() => Math.max(0, Math.min(100, props.level)));

const batteryColor = computed(() => {
	if (percent.value <= 20) return 'bg-red-500';
	if (percent.value <= 50) return 'bg-yellow-500';
	return 'bg-green-500';
});

const glowColor = computed(() => {
	if (percent.value <= 20) return 'bg-red-500/20';
	return 'bg-transparent';
});
</script>

<template>
	<div class="flex items-center gap-2">
		<template v-if="connected && level >= 0">
			<!-- Animated battery -->
			<div class="relative w-10 h-5 border-2 border-[var(--sidebar-border)] rounded-md p-[2px]">
				<div
					class="h-full rounded-sm transition-all duration-700 ease-out"
					:class="batteryColor"
					:style="{ width: `${percent}%` }"
				/>
				<div
					class="absolute -right-[3px] top-[3px] w-[3px] h-[10px] bg-[var(--sidebar-border)] rounded-r-[2px]"
				/>
				<!-- Low battery glow -->
				<div v-if="level <= 20" class="absolute inset-0 rounded-sm animate-pulse" :class="glowColor" />
			</div>
			<span class="text-sm font-medium tabular-nums text-[var(--sidebar-text-footer)]">{{ level }}%</span>
		</template>
		<template v-else-if="connected">
			<!-- Wireless: waiting for the first battery frame from the mouse -->
			<div
				class="relative w-10 h-5 border-2 border-[var(--sidebar-border)] rounded-md p-[2px]"
				title="Waiting for battery reading — move or wake the mouse"
			>
				<div class="h-full w-full rounded-sm bg-[var(--sidebar-border)]/30 animate-pulse" />
				<div
					class="absolute -right-[3px] top-[3px] w-[3px] h-[10px] bg-[var(--sidebar-border)] rounded-r-[2px]"
				/>
			</div>
			<span class="text-sm font-medium tabular-nums text-[var(--sidebar-text-footer)]">…</span>
		</template>
		<template v-else>
			<!-- Disconnected -->
			<div class="w-10 h-5 border-2 border-[var(--sidebar-text-muted)]/30 rounded-md p-[2px] opacity-30">
				<div class="h-full w-0 rounded-sm" />
			</div>
			<span class="text-xs text-[var(--sidebar-text-muted)] italic">Disconnected</span>
		</template>
	</div>
</template>
