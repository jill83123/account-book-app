<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { save } from '@/db'
import type { Category, Ledger } from '@/db/types'
import { budgetIn, defaultBudget } from '@/lib/budget'
import { evalExpr, fmt } from '@/lib/money'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'

const props = defineProps<{ table: 'categories' | 'ledgers'; id: string; month: string }>()
const open = defineModel<boolean>('open', { required: true })
const data = useData()
const ui = useUi()

const target = computed<Category | Ledger | undefined>(() =>
  props.table === 'categories' ? data.catMap.get(props.id) : data.ledgerMap.get(props.id),
)
const monthNo = computed(() => Number(props.month.slice(5)))
const monthLabel = computed(() => `${props.month.slice(0, 4)} 年 ${monthNo.value} 月`)
const text = ref('')
const hasOwn = computed(() => Boolean(target.value?.budgets && props.month in target.value.budgets))

// the sheet is created already open, so this also has to run once at the start
watch(
  open,
  (o) => {
    if (!o || !target.value) return
    const n = budgetIn(target.value, props.month)
    text.value = n ? String(n) : ''
  },
  { immediate: true },
)

const amount = computed(() => (text.value.trim() ? evalExpr(text.value) : 0))

/** the months with an amount of their own, without this one */
function othersOf(t: Category | Ledger): Record<string, number> | undefined {
  const rest = { ...t.budgets }
  delete rest[props.month]
  return Object.keys(rest).length ? rest : undefined
}

async function store(next: Category | Ledger) {
  if (props.table === 'categories') await save('categories', next as Category)
  else await save('ledgers', next as Ledger)
  open.value = false
}

/** only this month differs; the default and the other months stay as they are */
async function saveMonth() {
  const t = target.value
  const n = amount.value
  if (!t) return
  if (n == null || n < 0) return ui.toast('金額格式不正確', 'error')
  await store({ ...t, budgets: { ...t.budgets, [props.month]: Math.round(n) } })
}

/** the default changes, so every month without an amount of its own follows it */
async function saveDefault() {
  const t = target.value
  const n = amount.value
  if (!t) return
  if (n == null || n < 0) return ui.toast('金額格式不正確', 'error')
  await store({ ...t, ...defaultBudget(t, Math.round(n), props.month), budgets: othersOf(t) })
}

async function reset() {
  const t = target.value
  if (t) await store({ ...t, budgets: othersOf(t) })
}
</script>

<template>
  <BottomSheet v-model="open" :title="`「${target?.name ?? ''}」的預算`">
    <div v-if="target" class="space-y-4">
      <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-3">
          <label class="label !mb-0" for="budget-amount">{{ monthLabel }}的預算</label>
          <span class="text-xs text-muted">{{ target.budget ? `每月預設 $${fmt(target.budget)}` : '尚未設定每月預設' }}{{ hasOwn ? '・本月已自訂' : '' }}</span>
        </div>
        <input id="budget-amount" v-model="text" class="input" inputmode="numeric" placeholder="0（不設預算）" @keyup.enter="saveMonth" />
      </div>
      <div class="space-y-2">
        <button class="btn btn-primary w-full" :disabled="amount == null" @click="saveMonth">只改 {{ monthNo }} 月</button>
        <button class="btn btn-soft w-full" :disabled="amount == null" @click="saveDefault">改成每月預設</button>
        <button v-if="hasOwn" class="btn btn-ghost w-full" @click="reset">{{ monthNo }} 月改回預設</button>
      </div>
      <!-- the one thing the buttons do not say: a first default only reaches forward -->
      <p v-if="!target.budget" class="text-xs text-muted">改成每月預設後，從 {{ monthNo }} 月起每個月都用這個金額，更早的月份不受影響。</p>
    </div>
  </BottomSheet>
</template>
