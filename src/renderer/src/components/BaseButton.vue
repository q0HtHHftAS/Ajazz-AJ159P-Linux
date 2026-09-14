<template>
	<button
		:class="[
			'transition-all rounded-lg px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed',
			variant === 'green'
				? 'bg-[#E95420] hover:bg-[#C74416] active:bg-[#A53812] text-white'
				: variant === 'red'
					? 'bg-red-600 hover:bg-red-700 text-white'
					: 'bg-transparent border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--border-card)]/50 hover:border-transparent',
		]"
		v-bind="$attrs"
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
withDefaults(
	defineProps<{
		variant?: 'minimal' | 'green' | 'red';
	}>(),
	{
		variant: 'minimal',
	},
);
</script>
