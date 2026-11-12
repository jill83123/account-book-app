<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Copy, ExternalLink, LoaderCircle } from '@/lib/uiIcons'
import { buildPrompt, listModels } from '@/lib/gemini'
import { useData } from '@/stores/data'
import { DEFAULT_GEMINI_MODEL, useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import PageHeader from '@/components/PageHeader.vue'

const { s } = useSettings()
const data = useData()
const ui = useUi()

const DEFAULT_MODEL = DEFAULT_GEMINI_MODEL
// an emptied field would leave scanning with no model at all
if (!s.geminiModel.trim()) s.geminiModel = DEFAULT_MODEL
const models = ref<string[]>([])
const loading = ref(false)
const prompt = computed(() => buildPrompt(data.categories))

async function load() {
  loading.value = true
  try {
    models.value = await listModels(s.geminiKey.trim(), s.workerUrl)
    if (!models.value.length) ui.toast('這把金鑰沒有可用的模型', 'error')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    loading.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    ui.toast('已複製提詞', 'success')
  } catch {
    ui.toast('無法自動複製，請長按選取文字', 'error')
  }
}
</script>

<template>
  <div>
    <PageHeader title="AI 發票辨識" />

    <section class="card mb-4 space-y-3">
      <h2 class="font-semibold">Gemini 自動辨識</h2>
      <p class="text-sm text-muted">
        拍發票照片，Gemini 會讀出商家、日期和每個品項，並依你的分類自動歸類。金鑰只存在這台裝置，不會同步到雲端，辨識時照片會直接傳給 Google。
      </p>
      <ol class="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          打開
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-primary">Google AI Studio<ExternalLink :size="12" /></a>
          ，登入後建立 API 金鑰（有免費額度）。
        </li>
        <li>貼到下面就完成了，模型已經幫你選好。</li>
      </ol>
      <div v-if="!s.workerUrl">
        <label class="label" for="key">API 金鑰</label>
        <input id="key" v-model="s.geminiKey" type="password" class="input" autocomplete="off" placeholder="AIza..." />
      </div>
      <p v-else class="text-sm text-muted">已設定同步服務，金鑰存放在 Worker 裡，這台裝置不用填。</p>
      <details class="group rounded-2xl bg-surface-2 px-4">
        <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 py-3.5 text-sm text-muted select-none [&::-webkit-details-marker]:hidden">
          <span class="min-w-0 truncate">進階：模型（目前 {{ s.geminiModel || DEFAULT_MODEL }}）</span>
          <ChevronDown :size="18" class="shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div class="space-y-3 pb-4">
          <p class="text-sm text-muted">預設的模型就能用。只有辨識時出現「找不到模型」的錯誤才需要換，按下面的按鈕會列出有免費額度的 Flash 模型。</p>
          <div>
            <label class="label" for="model">模型</label>
            <input id="model" v-model="s.geminiModel" class="input" autocapitalize="off" list="models" />
            <datalist id="models"><option v-for="m in models" :key="m" :value="m" /></datalist>
          </div>
          <button class="btn btn-ghost w-full" :disabled="loading" @click="load">
            <LoaderCircle v-if="loading" :size="16" class="animate-spin" />列出可用模型
          </button>
          <div v-if="models.length" class="flex flex-wrap gap-2">
            <button v-for="m in models.slice(0, 16)" :key="m" class="chip text-xs" :class="s.geminiModel === m && 'chip-on'" @click="s.geminiModel = m">{{ m }}</button>
          </div>
        </div>
      </details>
    </section>

    <section class="card space-y-3">
      <h2 class="font-semibold">手動提詞（不需要金鑰）</h2>
      <p class="text-sm text-muted">
        把這段提詞連同發票照片貼到任何 AI 對話（例如 Gemini App），再把回覆貼回「新增記錄 → 掃描發票 → 手動提詞」的輸入框。提詞已經包含你目前的分類清單，修改分類後會自動更新。
      </p>
      <pre class="max-h-60 overflow-auto rounded-2xl bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap">{{ prompt }}</pre>
      <button class="btn btn-primary w-full" @click="copy"><Copy :size="16" />複製提詞</button>
    </section>
  </div>
</template>
