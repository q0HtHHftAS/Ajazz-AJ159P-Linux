import { ref, type Ref, onUnmounted } from 'vue';

export interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
}

const toasts = ref<Toast[]>([]) as Ref<Toast[]>;
let nextId = 0;
const pendingTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

export function useToast(): {
	toasts: typeof toasts;
	addToast: (message: string, type: Toast['type'], duration?: number) => void;
	success: (message: string) => void;
	error: (message: string, duration?: number) => void;
	info: (message: string) => void;
	removeToast: (id: number) => void;
} {
	const addToast = (message: string, type: Toast['type'] = 'success', duration = 3000): void => {
		const id = nextId++;
		toasts.value = [...toasts.value, { id, message, type }];
		const timeoutId = setTimeout(() => {
			toasts.value = toasts.value.filter((t) => t.id !== id);
			pendingTimeouts.delete(id);
		}, duration);
		pendingTimeouts.set(id, timeoutId);
	};

	const success = (message: string): void => addToast(message, 'success');
	// Errors linger longer (5s) so they catch the eye next to inline banners.
	const error = (message: string, duration = 5000): void => addToast(message, 'error', duration);
	const info = (message: string): void => addToast(message, 'info');

	const removeToast = (id: number): void => {
		toasts.value = toasts.value.filter((t) => t.id !== id);
		const timeoutId = pendingTimeouts.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			pendingTimeouts.delete(id);
		}
	};

	onUnmounted(() => {
		for (const timeoutId of pendingTimeouts.values()) {
			clearTimeout(timeoutId);
		}
		pendingTimeouts.clear();
	});

	return { toasts, addToast, success, error, info, removeToast };
}
