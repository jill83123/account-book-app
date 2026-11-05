<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { save } from '@/db'
import { BASE_CURRENCY, currencyItems, currencyName } from '@/lib/currency'
import { COLORS } from '@/lib/icons'
import { uid } from '@/lib/id'
import { Check, ChevronDown, Plus } from '@/lib/uiIcons'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import PickSheet from './PickSheet.vue'

defineProps<{ title?: string }>()
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ pick: [id: string] }>()
const data = useData()
const ui = useUi()

const items = computed(() => data.sortedLedgers.map((l) => ({ value: l.id, label: l.name, sub: currencyName(l.currency ?? BASE_CURRENCY), icon: 'book', color: l.color })))

// a new ledger without leaving this sheet: a name, and a currency if it is not TWD
const adding = ref(false)
const name = ref('')
const currency = ref(BASE_CURRENCY)
const showCurrencies = ref(false)
const currentCurrency = computed(() => currencyItems.find((c) => c.value === currency.value))
function pickCurrency(code: string) {
  currency.value = code
  showCurrencies.value = false
}
watch(open, (o) => {
  if (o) {
    adding.value = false
    showCurrencies.value = false
    name.value = ''
    currency.value = BASE_CURRENCY
  }
})

async function create() {
  const n = name.value.trim()
  if (!n) return ui.toast('請輸入帳本名稱', 'error')
  if (data.ledgers.some((l) => l.name === n)) return ui.toast('已經有同名的帳本', 'error')
  const id = uid()
  await save('ledgers', {
    id,
    name: n,
    order: data.ledgers.length,
    color: COLORS[data.ledgers.length % COLORS.length]!,
    ...(currency.value !== BASE_CURRENCY ? { currency: currency.value } : {}),
  })
  model.value = id
  emit('pick', id)
  open.value = false
}
</script>

<template>
  <PickSheet v-model:open="open" v-model="model" :title="title ?? '帳本'" :items="items" @pick="emit('pick', $event)">
    <div class="mt-4">
      <button class="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary-soft py-3 text-sm font-semibold text-primary-strong transition active:scale-[0.99]" @click="adding = true">
        <Plus :size="16" />新增帳本
      </button>
    </div>
  </PickSheet>

  <!-- a centred dialog for the new ledger, like the other small confirmations -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="adding"
        class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
        @click.self="adding = false"
        @keydown.esc="adding = false"
      >
        <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="create">
          <h2 class="text-lg leading-snug font-bold">新增帳本</h2>
          <div class="space-y-3">
            <input v-model="name" class="input" maxlength="20" placeholder="帳本名稱，例如：旅行" />
            <button type="button" class="input flex w-full items-center justify-between gap-2 text-left" aria-label="選擇幣別" @click="showCurrencies = true">
              <span class="min-w-0 flex-1 truncate">{{ currentCurrency?.label }}<span class="ml-2 text-xs text-muted">{{ currentCurrency?.sub }}</span></span>
              <ChevronDown :size="16" class="shrink-0 text-muted" />
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-soft" @click="adding = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="!name.trim()">新增並切換</button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- the currency list, a second dialog on top of the first -->
    <Transition name="fade">
      <div
        v-if="adding && showCurrencies"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
        @click.self="showCurrencies = false"
        @keydown.esc="showCurrencies = false"
      >
        <div class="card w-full max-w-[21rem] p-0 shadow-xl">
          <h2 class="border-b border-line px-4 py-3 text-base font-bold">選擇幣別</h2>
          <ul class="max-h-80 divide-y divide-line overflow-y-auto">
            <li v-for="c in currencyItems" :key="c.value">
              <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left" @click="pickCurrency(c.value)">
                <span>
                  <span class="block font-medium">{{ c.label }}</span>
                  <span class="block text-xs text-muted">{{ c.sub }}</span>
                </span>
                <Check v-if="c.value === currency" :size="18" class="text-primary" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
