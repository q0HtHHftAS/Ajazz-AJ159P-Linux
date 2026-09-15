<script setup lang="ts">
import { computed } from 'vue';
import { Cable } from 'lucide-vue-next';

const props = withDefaults(
	defineProps<{
		level: number;
		connected: boolean;
		kind?: 'wireless' | 'wired';
	}>(),
	{ level: -1, connected: false, kind: 'wireless' },
);

const percent = computed(() => Math.max(0, Math.min(100, props.level)));

// Green fill, red when low.
const fillColor = computed(() => (percent.value <= 20 ? 'bg-red-500' : 'bg-green-500'));
</script>

<template>
	<div class="flex items-center gap-2">
		<template v-if="connected && kind === 'wired'">
			<!-- Wired USB has no battery to report — static mode label only -->
			<div
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-card)]"
				:title="$t('connection.wired')"
			>
				<Cable class="w-3.5 h-3.5 text-[var(--text-secondary)]" />
				<span class="text-xs font-medium text-[var(--sidebar-text-footer)]">USB</span>
			</div>
		</template>
		<template v-else-if="connected && level >= 0">
			<!-- iOS-style battery: slim shell, cap nub -->
			<div class="relative flex items-center">
				<div class="relative w-10 h-5 rounded-[6px] border border-white/40 p-[2px]">
					<div
						class="h-full rounded-[3px] transition-all duration-700 ease-out"
						:class="fillColor"
						:style="{ width: `${percent}%` }"
					/>
				</div>
				<div class="w-[2.5px] h-[9px] ml-[1.5px] rounded-r-full bg-white/40" />
			</div>
			<span class="text-sm font-medium tabular-nums text-[var(--sidebar-text-footer)]">{{ level }}%</span>
		</template>
		<template v-else-if="connected">
			<!-- Waiting for the first battery reading from the mouse -->
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
