<script setup lang="ts">
import { computed, ref } from 'vue'
import { Camera, Circle, CircleCheck, ClipboardPaste, Copy, ImagePlus, LoaderCircle } from '@/lib/uiIcons'
import { useRouter } from 'vue-router'
import { buildPrompt, parseResult, scanReceipt, toDraft } from '@/lib/gemini'
import { useData } from '@/stores/data'
import { DEFAULT_GEMINI_MODEL, useSettings } from '@/stores/settings'
import { useUi, type Draft } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ draft: [d: Draft] }>()

const data = useData()
const { s } = useSettings()
const ui = useUi()
const router = useRouter()

const tab = ref<'api' | 'manual'>('api')
const modes = [
  { value: 'split', label: '每項分開記', hint: '每個商品一列，各自分類' },
  { value: 'merge', label: '合併成一項', hint: '一個分類，商品記在細項' },
] as const
/** a key (or the sync service that holds one) is set up */
const ready = computed(() => Boolean(s.geminiKey || s.workerUrl))
const busy = ref(false)
const error = ref('')
const pasted = ref('')

function finish(res: ReturnType<typeof parseResult>) {
  emit('draft', toDraft(res, data.categories))
  open.value = false
  pasted.value = ''
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    finish(await scanReceipt(file, { key: s.geminiKey, workerUrl: s.workerUrl, model: s.geminiModel.trim() || DEFAULT_GEMINI_MODEL, cats: data.categories, mode: s.scanMode }))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(buildPrompt(data.categories, s.scanMode))
    ui.toast('已複製提詞，貼到 AI 對話並附上發票照片', 'success')
  } catch {
    ui.toast('無法複製，請到「AI 發票」頁面手動複製', 'error')
  }
}

function parsePasted() {
  error.value = ''
  try {
    finish(parseResult(pasted.value))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function goSetup() {
  open.value = false
  void router.push('/more/ai')
}
</script>

<template>
  <BottomSheet v-model="open" title="掃描發票">
    <div class="space-y-4">
      <PillTabs
        v-model="tab"
        :options="[
          { value: 'api', label: 'Gemini 自動辨識' },
          { value: 'manual', label: '手動提詞' },
        ]"
      />

      <!-- what this does, first; then how to record it; then the buttons that start it -->
      <p v-if="tab === 'api' && ready" class="text-sm leading-relaxed text-muted">
        拍下或選擇發票照片，Gemini 會讀出商家、日期與每個品項並幫你分類，你可以在記錄表單裡確認後再儲存。
      </p>
      <p v-else-if="tab === 'api'" class="text-sm leading-relaxed text-muted">
        還沒有設定 Gemini API 金鑰。金鑰可以在 Google AI Studio 免費取得，設定一次就好。
      </p>
      <ol v-else class="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
        <li>複製提詞（內含你目前的分類清單）。</li>
        <li>到 Gemini、ChatGPT 或任何 AI 對話，貼上提詞並附上發票照片。</li>
        <li>把 AI 回覆的內容貼在下面，按「讀取」鈕。</li>
      </ol>

      <!-- a choice, not a page: two cards, the picked one outlined in the theme colour -->
      <div v-if="tab === 'manual' || ready">
        <p class="label">怎麼記</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="m in modes"
            :key="m.value"
            type="button"
            class="flex items-start gap-2 rounded-2xl border px-3 py-3 text-left transition"
            :class="s.scanMode === m.value ? 'border-primary bg-primary-soft' : 'border-line bg-surface'"
            :aria-pressed="s.scanMode === m.value"
            @click="s.scanMode = m.value"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold" :class="s.scanMode === m.value && 'text-primary-strong'">{{ m.label }}</span>
              <span class="mt-0.5 block text-xs leading-snug text-muted">{{ m.hint }}</span>
            </span>
            <component
              :is="s.scanMode === m.value ? CircleCheck : Circle"
              :size="18"
              class="mt-0.5 shrink-0"
              :class="s.scanMode === m.value ? 'text-primary' : 'text-muted/50'"
            />
          </button>
        </div>
      </div>

      <template v-if="tab === 'api'">
        <template v-if="ready">
          <div class="grid gap-2.5 pt-1">
            <label class="btn btn-primary" :class="busy && 'pointer-events-none opacity-50'">
              <Camera :size="18" />拍照
              <input type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
            </label>
            <label class="btn btn-ghost" :class="busy && 'pointer-events-none opacity-50'">
              <ImagePlus :size="18" />選照片
              <input type="file" accept="image/*" class="hidden" @change="onFile" />
            </label>
          </div>
          <p v-if="busy" class="flex items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle :size="16" class="animate-spin" />辨識中，通常需要幾秒鐘
          </p>
        </template>
        <button v-else class="btn btn-primary w-full" @click="goSetup">前往設定</button>
      </template>

      <template v-else>
        <button class="btn btn-ghost w-full" @click="copyPrompt"><Copy :size="16" />複製提詞</button>
        <textarea
          v-model="pasted"
          class="input min-h-32 font-mono text-xs"
          placeholder="貼上 AI 的回覆"
        />
        <button class="btn btn-primary w-full" :disabled="!pasted.trim()" @click="parsePasted">
          <ClipboardPaste :size="16" />讀取
        </button>
      </template>

      <p v-if="error" class="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{{ error }}</p>
    </div>
  </BottomSheet>
</template>
