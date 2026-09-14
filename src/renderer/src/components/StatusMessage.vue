<script setup lang="ts">
defineProps<{
	message: string;
	type?: 'success' | 'error';
}>();
</script>

<template>
	<div
		v-if="message"
		:class="[
			'p-3 rounded-lg text-sm border',
			type === 'error'
				? 'bg-red-500/10 border-red-500/20 text-red-400'
				: 'bg-ajazz-accent/10 border-ajazz-accent/20 text-ajazz-accent',
		]"
	>
		{{ message }}
	</div>
</template>
