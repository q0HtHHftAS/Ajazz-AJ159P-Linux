<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, Plus, Trash2, Circle, Square, Download, Upload, Eraser } from 'lucide-vue-next';
import BaseButton from './BaseButton.vue';
import BaseInput from './BaseInput.vue';
import BaseSelect from './BaseSelect.vue';
import StatusMessage from './StatusMessage.vue';
import { KeyCode } from '../../../shared/macro-templates.js';
import { MacroMode } from '../../../shared/macro-types.js';

const MACRO_PREFIX = '__macro__';

const props = defineProps<{
	isConnected: boolean;
	initialButton: number;
}>();

const emit = defineEmits<{
	close: [];
	applied: [button: number];
}>();

const { t } = useI18n();

interface RecordedEvent {
	id: string;
	keyCode: number;
	delayMs: number;
	isRelease: boolean;
}

interface MacroFile {
	name: string;
	events: Array<{ keyCode: number; delayMs: number; isRelease: boolean }>;
	playOptions: { mode: MacroMode; times: number };
	targetButton: number;
}

const TARGET_BUTTONS = [
	{ label: 'macros.buttons.left', value: 0 },
	{ label: 'macros.buttons.right', value: 1 },
	{ label: 'macros.buttons.middle', value: 2 },
	{ label: 'macros.buttons.forward', value: 3 },
	{ label: 'macros.buttons.backward', value: 4 },
];

const targetOptions = computed(() => TARGET_BUTTONS.map((b) => ({ label: t(b.label), value: b.value })));

const macroName = ref('');
const targetButton = ref(props.initialButton <= 4 ? props.initialButton : 3);
const repeatTimes = ref(1);
const events = ref<RecordedEvent[]>([]);
const macroFiles = ref<string[]>([]);
const recording = ref(false);
const recordCount = ref(0);
const skippedCount = ref(0);
const statusMessage = ref('');
const isError = ref(false);
const applying = ref(false);
let lastEventTime = 0;
let eventSeq = 0;

// Map physical keyboard codes to HID key codes
function codeToHid(code: string): number | null {
	if (/^Key[A-Z]$/.test(code)) {
		const v = KeyCode[code.slice(3) as keyof typeof KeyCode];
		return typeof v === 'number' ? v : null;
	}
	if (/^Digit[0-9]$/.test(code)) {
		const v = KeyCode[('DIGIT_' + code.slice(5)) as keyof typeof KeyCode];
		return typeof v === 'number' ? v : null;
	}
	if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
		const v = KeyCode[code as keyof typeof KeyCode];
		return typeof v === 'number' ? v : null;
	}
	if (/^Numpad[0-9]$/.test(code)) {
		const v = KeyCode[('NUMPAD_' + code.slice(6)) as keyof typeof KeyCode];
		return typeof v === 'number' ? v : null;
	}
	const extra: Record<string, KeyCode> = {
		Enter: KeyCode.ENTER,
		Escape: KeyCode.ESC,
		Backspace: KeyCode.BACKSPACE,
		Tab: KeyCode.TAB,
		Space: KeyCode.SPACE,
		CapsLock: KeyCode.CAPS_LOCK,
		BracketRight: KeyCode.BRACKET_RIGHT,
		Backslash: KeyCode.BACKSLASH,
		Semicolon: KeyCode.SEMICOLON,
		Quote: KeyCode.QUOTE,
		Backquote: KeyCode.BACKQUOTE,
		Comma: KeyCode.COMMA,
		Period: KeyCode.PERIOD,
		Slash: KeyCode.SLASH,
		PrintScreen: KeyCode.PRINT_SCREEN,
		ScrollLock: KeyCode.SCROLL_LOCK,
		Pause: KeyCode.PAUSE,
		Insert: KeyCode.INSERT,
		Home: KeyCode.HOME,
		PageUp: KeyCode.PAGE_UP,
		Delete: KeyCode.DELETE,
		End: KeyCode.END,
		PageDown: KeyCode.PAGE_DOWN,
		ArrowRight: KeyCode.ARROW_RIGHT,
		ArrowLeft: KeyCode.ARROW_LEFT,
		ArrowDown: KeyCode.ARROW_DOWN,
		ArrowUp: KeyCode.ARROW_UP,
		NumLock: KeyCode.NUM_LOCK,
		NumpadDivide: KeyCode.NUMPAD_DIVIDE,
		NumpadMultiply: KeyCode.NUMPAD_MULTIPLY,
		NumpadSubtract: KeyCode.NUMPAD_SUBTRACT,
		NumpadAdd: KeyCode.NUMPAD_ADD,
		NumpadEnter: KeyCode.NUMPAD_ENTER,
		NumpadDecimal: KeyCode.NUMPAD_DECIMAL,
		ControlLeft: KeyCode.LCtrl,
		ControlRight: KeyCode.RCtrl,
		ShiftLeft: KeyCode.LShift,
		ShiftRight: KeyCode.RShift,
		AltLeft: KeyCode.LAlt,
		AltRight: KeyCode.RAlt,
		MetaLeft: KeyCode.LWin,
		MetaRight: KeyCode.RWin,
		ContextMenu: KeyCode.CONTEXT_MENU,
	};
	return extra[code] ?? null;
}

const keyLabel = (code: number): string => {
	const entry = Object.entries(KeyCode).find(([, v]) => v === code);
	return entry ? entry[0] : `0x${code.toString(16).toUpperCase()}`;
};

const isEditableTarget = (e: KeyboardEvent): boolean => {
	const el = e.target as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const pushRecorded = (keyCode: number, isRelease: boolean) => {
	if (events.value.length >= 47) {
		stopRecording();
		return;
	}
	const now = performance.now();
	const delay = events.value.length === 0 ? 10 : Math.max(0, Math.round(now - lastEventTime));
	lastEventTime = now;
	events.value.push({ id: `e${eventSeq++}`, keyCode, delayMs: delay, isRelease });
	recordCount.value = events.value.length;
};

const handleKeyDown = (e: KeyboardEvent) => {
	if (!recording.value || e.repeat || isEditableTarget(e)) return;
	const hid = codeToHid(e.code);
	if (hid === null) {
		skippedCount.value++;
		return;
	}
	e.preventDefault();
	pushRecorded(hid, false);
};

const handleKeyUp = (e: KeyboardEvent) => {
	if (!recording.value || isEditableTarget(e)) return;
	const hid = codeToHid(e.code);
	if (hid === null) return;
	pushRecorded(hid, true);
};

const startRecording = () => {
	recording.value = true;
	recordCount.value = events.value.length;
	skippedCount.value = 0;
	lastEventTime = performance.now();
};

const stopRecording = () => {
	recording.value = false;
};

const clearEvents = () => {
	events.value = [];
	recordCount.value = 0;
	skippedCount.value = 0;
};

const removeEvent = (id: string) => {
	events.value = events.value.filter((e) => e.id !== id);
};

const statusType = computed(() => (isError.value ? 'error' : 'success'));

const loadFileList = async () => {
	const all = await window.api.listProfiles();
	macroFiles.value = all.filter((n) => n.startsWith(MACRO_PREFIX)).map((n) => n.slice(MACRO_PREFIX.length));
};

const currentFile = (): MacroFile => ({
	name: macroName.value.trim(),
	events: events.value.map((e) => ({ keyCode: e.keyCode, delayMs: e.delayMs, isRelease: e.isRelease })),
	playOptions: { mode: MacroMode.THE_NUMBER_OF_TIME_TO_PLAY, times: Math.max(1, Math.min(255, repeatTimes.value)) },
	targetButton: targetButton.value,
});

const saveMacro = async () => {
	const file = currentFile();
	if (!file.name) return;
	await window.api.saveProfile(MACRO_PREFIX + file.name, file);
	statusMessage.value = t('macromodal.saved');
	isError.value = false;
	setTimeout(() => (statusMessage.value = ''), 3000);
	await loadFileList();
};

const loadMacro = async (name: string) => {
	const data = (await window.api.loadProfile(MACRO_PREFIX + name)) as MacroFile | null;
	if (!data) return;
	macroName.value = data.name ?? name;
	targetButton.value = typeof data.targetButton === 'number' ? data.targetButton : 3;
	repeatTimes.value = data.playOptions?.times ?? 1;
	events.value = (data.events ?? []).map((e) => ({ ...e, id: `e${eventSeq++}` }));
};

const deleteMacro = async (name: string) => {
	if (!confirm(`${t('preferences.deleteAction')}: ${name}?`)) return;
	await window.api.deleteProfile(MACRO_PREFIX + name);
	if (macroName.value === name) {
		macroName.value = '';
		events.value = [];
	}
	await loadFileList();
};

const newMacro = () => {
	macroName.value = '';
	events.value = [];
	repeatTimes.value = 1;
};

const applyMacroFile = async () => {
	if (!props.isConnected || applying.value) return;
	if (events.value.length === 0) {
		isError.value = true;
		statusMessage.value = `${t('macros.errorPrefix')}${t('macromodal.empty')}`;
		return;
	}
	applying.value = true;
	isError.value = false;
	statusMessage.value = t('macros.applying');
	try {
		await window.api.sendCustomMacro({
			targetButton: targetButton.value,
			playOptions: {
				mode: MacroMode.THE_NUMBER_OF_TIME_TO_PLAY,
				times: Math.max(1, Math.min(255, repeatTimes.value)),
			},
			events: events.value.map((e) => ({ keyCode: e.keyCode, delayMs: e.delayMs, isRelease: e.isRelease })),
		});
		statusMessage.value = t('macromodal.applied');
		emit('applied', targetButton.value);
		setTimeout(() => (statusMessage.value = ''), 3000);
	} catch (err: unknown) {
		isError.value = true;
		statusMessage.value = `${t('macros.errorPrefix')}${err instanceof Error ? err.message : String(err)}`;
	} finally {
		applying.value = false;
	}
};

const exportMacro = () => {
	const file = currentFile();
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${file.name || 'macro'}.json`;
	a.click();
	URL.revokeObjectURL(url);
};

const importInput = ref<HTMLInputElement | null>(null);

const importMacro = async (e: Event) => {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	try {
		const data = JSON.parse(await file.text()) as Partial<MacroFile>;
		if (!Array.isArray(data.events)) throw new Error('bad file');
		macroName.value = typeof data.name === 'string' ? data.name : file.name.replace(/\.json$/i, '');
		targetButton.value = typeof data.targetButton === 'number' ? data.targetButton : 3;
		repeatTimes.value = data.playOptions?.times ?? 1;
		events.value = data.events
			.filter((ev) => typeof ev?.keyCode === 'number')
			.slice(0, 47)
			.map((ev) => ({
				id: `e${eventSeq++}`,
				keyCode: ev.keyCode,
				delayMs: typeof ev.delayMs === 'number' ? ev.delayMs : 10,
				isRelease: ev.isRelease === true,
			}));
		isError.value = false;
		statusMessage.value = '';
	} catch {
		isError.value = true;
		statusMessage.value = `${t('macros.errorPrefix')}${t('macromodal.empty')}`;
	}
};

onMounted(() => {
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
	void loadFileList();
});

onUnmounted(() => {
	window.removeEventListener('keydown', handleKeyDown);
	window.removeEventListener('keyup', handleKeyUp);
});
</script>

<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" @click.self="emit('close')">
		<div
			class="w-[min(880px,94vw)] max-h-[88vh] flex flex-col bg-[var(--bg-card)] rounded-2xl border border-[#E95420]/40 overflow-hidden"
		>
			<!-- Title bar -->
			<div
				class="flex items-center justify-between px-5 py-3 bg-[#E95420]/10 border-b border-[var(--border-card)] flex-shrink-0"
			>
				<h2 class="font-bold text-[#f9a88a]">{{ $t('macromodal.title') }}</h2>
				<button
					@click="emit('close')"
					class="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
				<!-- File list -->
				<div
					class="border-b md:border-b-0 md:border-r border-[var(--border-card)] p-3 space-y-1 overflow-y-auto max-h-40 md:max-h-none"
				>
					<button
						@click="newMacro"
						class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-all"
					>
						<Plus class="w-4 h-4" /> {{ $t('macromodal.new') }}
					</button>
					<button
						v-for="f in macroFiles"
						:key="f"
						@click="loadMacro(f)"
						:class="[
							'w-full group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
							macroName === f
								? 'bg-[#E95420]/15 text-[#f9a88a]'
								: 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
						]"
					>
						<span class="flex-1 truncate text-left">{{ f }}</span>
						<Trash2
							class="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-red-400 flex-shrink-0 transition-all"
							@click.stop="deleteMacro(f)"
						/>
					</button>
				</div>

				<!-- Editor -->
				<div class="p-4 space-y-3 overflow-y-auto">
					<div class="flex flex-col sm:flex-row gap-2">
						<BaseInput v-model="macroName" :placeholder="$t('macromodal.name')" class="flex-1 min-w-0" />
						<BaseSelect v-model="targetButton" :options="targetOptions" class="sm:w-44" />
						<button
							@click="recording ? stopRecording() : startRecording()"
							:class="[
								'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all flex-shrink-0',
								recording ? 'bg-red-600 hover:bg-red-700' : 'bg-[#E95420] hover:bg-[#C74416]',
							]"
						>
							<Circle v-if="!recording" class="w-3.5 h-3.5 fill-current" />
							<Square v-else class="w-3.5 h-3.5 fill-current animate-pulse" />
							{{ recording ? `${$t('macromodal.stop')} (${recordCount})` : $t('macromodal.record') }}
						</button>
					</div>

					<p class="text-xs text-[var(--text-muted)]">{{ $t('macromodal.hint') }}</p>

					<div class="rounded-xl border border-[var(--border-card)] overflow-hidden">
						<div
							class="grid grid-cols-[1fr_90px_90px_36px] text-xs text-[var(--text-muted)] px-3 py-2 border-b border-[var(--border-card)] bg-[var(--bg-primary)]"
						>
							<span>{{ $t('macromodal.key') }}</span>
							<span>{{ $t('macromodal.action') }}</span>
							<span>{{ $t('macromodal.delayMs') }}</span>
							<span />
						</div>
						<div class="max-h-48 overflow-y-auto">
							<div
								v-for="ev in events"
								:key="ev.id"
								class="grid grid-cols-[1fr_90px_90px_36px] items-center px-3 py-1.5 text-sm border-b border-[var(--border-card)]/50 last:border-0"
							>
								<span class="font-mono text-[var(--text-primary)] truncate">{{
									keyLabel(ev.keyCode)
								}}</span>
								<span :class="ev.isRelease ? 'text-[var(--text-muted)]' : 'text-[#f9a88a]'">
									{{ ev.isRelease ? $t('macromodal.release') : $t('macromodal.press') }}
								</span>
								<span class="tabular-nums text-[var(--text-secondary)]">{{ ev.delayMs }} ms</span>
								<button
									@click="removeEvent(ev.id)"
									class="text-[var(--text-muted)] hover:text-red-400 transition-colors"
									aria-label="Remove"
								>
									<X class="w-4 h-4" />
								</button>
							</div>
							<p v-if="events.length === 0" class="text-center text-sm text-[var(--text-muted)] py-6">
								{{ $t('macromodal.empty') }}
							</p>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs text-[var(--text-muted)]">{{ $t('macromodal.repeat') }}</span>
						<BaseInput type="number" v-model.number="repeatTimes" :min="1" :max="255" class="w-20" />
						<span class="text-xs text-[var(--text-muted)]">{{ $t('macromodal.times') }}</span>
						<div class="flex-1" />
						<button
							@click="clearEvents"
							class="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
						>
							<Eraser class="w-3.5 h-3.5" /> {{ $t('macromodal.clear') }}
						</button>
					</div>

					<StatusMessage :message="statusMessage" :type="statusType" />

					<div class="flex flex-wrap items-center gap-2 pt-1">
						<button
							@click="saveMacro"
							:disabled="!macroName.trim()"
							class="px-4 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-all disabled:opacity-40"
						>
							{{ $t('preferences.saveProfile') }}
						</button>
						<button
							@click="exportMacro"
							:disabled="events.length === 0"
							class="flex items-center gap-1 px-4 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-all disabled:opacity-40"
						>
							<Download class="w-4 h-4" /> {{ $t('macromodal.export') }}
						</button>
						<button
							@click="importInput?.click()"
							class="flex items-center gap-1 px-4 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-all"
						>
							<Upload class="w-4 h-4" /> {{ $t('macromodal.import') }}
						</button>
						<input
							ref="importInput"
							type="file"
							accept=".json,application/json"
							class="hidden"
							@change="importMacro"
						/>
						<div class="flex-1" />
						<BaseButton
							@click="applyMacroFile"
							:disabled="!isConnected || applying || events.length === 0"
							variant="green"
						>
							{{ applying ? $t('macros.applying') : $t('macromodal.applyMacro') }}
						</BaseButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
