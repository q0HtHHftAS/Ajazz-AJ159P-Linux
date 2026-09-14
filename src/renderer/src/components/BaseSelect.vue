<template>
	<div ref="root" class="relative w-full">
		<button
			type="button"
			@click="toggle"
			@keydown.escape="open = false"
			:class="[
				'w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-all outline-none border',
				open
					? 'bg-[var(--border-card)]/80 border-[#E95420]/60 text-[var(--text-primary)]'
					: 'bg-[var(--border-card)]/50 border-transparent hover:bg-[var(--border-card)]/80 text-[var(--text-primary)]',
			]"
		>
			<span class="truncate">{{ selectedLabel }}</span>
			<ChevronDown
				class="w-4 h-4 flex-shrink-0 text-[var(--text-muted)] transition-transform duration-200"
				:class="open ? 'rotate-180' : ''"
			/>
		</button>
	</div>
	<button
		v-if="open"
		type="button"
		@click="open = false"
		class="fixed inset-0 z-30 cursor-default"
		aria-label="Close menu"
		tabindex="-1"
	/>
	<div
		v-if="open"
		class="fixed z-40 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
		:style="{ top: panelTop + 'px', left: panelLeft + 'px', width: panelWidth + 'px' }"
	>
		<div
			:class="columns > 1 ? 'grid gap-1 p-1.5' : 'py-1'"
			:style="columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : {}"
		>
			<button
				v-for="opt in options"
				:key="String(opt.value)"
				type="button"
				@click="choose(opt.value)"
				:class="[
					columns > 1
						? 'text-center px-1 py-1.5 text-xs rounded-md'
						: 'w-full text-left px-3 py-1.5 text-sm rounded-lg',
					'truncate transition-colors',
					opt.value === modelValue
						? 'text-[#E95420] bg-[#E95420]/10 font-medium'
						: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
				]"
			>
				{{ opt.label }}
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

interface SelectOption {
	label: string;
	value: string | number;
}

const props = withDefaults(
	defineProps<{
		modelValue: string | number;
		options: SelectOption[];
		columns?: number;
	}>(),
	{
		columns: 1,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: string | number];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const panelTop = ref(0);
const panelLeft = ref(0);
const panelWidth = ref(0);

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label ?? '');

const toggle = (): void => {
	if (!open.value && root.value) {
		const rect = root.value.getBoundingClientRect();
		const cols = Math.max(1, props.columns);
		const estH = Math.ceil(props.options.length / cols) * 32 + 16;
		panelWidth.value = rect.width;
		panelLeft.value = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
		panelTop.value =
			rect.bottom + estH > window.innerHeight && rect.top - estH > 8
				? Math.max(8, rect.top - estH - 4)
				: rect.bottom + 4;
	}
	open.value = !open.value;
};

const choose = (value: string | number): void => {
	emit('update:modelValue', value);
	open.value = false;
};
</script>
