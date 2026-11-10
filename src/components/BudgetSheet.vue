<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { save } from '@/db'
import type { Category, Ledger } from '@/db/types'
import { budgetIn, defaultBudget } from '@/lib/budget'
import { addYm, ym } from '@/lib/date'
import { evalExpr } from '@/lib/money'
import { RotateCcw, X } from '@/lib/uiIcons'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import ToggleSwitch from './ToggleSwitch.vue'

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

/** 這次改的是只有這個月，還是每月預設；已經有預設或這個月自訂過，就先停在只改這個月 */
const scope = ref<'month' | 'default'>('month')
const everyMonth = computed({
  get: () => scope.value === 'default',
  set: (v: boolean) => (scope.value = v ? 'default' : 'month'),
})

// 鍵盤只會縮小 iOS 的可視區域，所以視窗要置中在鍵盤上方剩下的空間（作法同 UiLayer）
const keyboard = ref(0)
const offsetTop = ref(0)
function measureKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  offsetTop.value = Math.max(0, Math.round(vv.offsetTop))
  keyboard.value = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}
onMounted(() => {
  window.visualViewport?.addEventListener('resize', measureKeyboard)
  window.visualViewport?.addEventListener('scroll', measureKeyboard)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', measureKeyboard)
  window.visualViewport?.removeEventListener('scroll', measureKeyboard)
})

// the dialog is created already open, so this also has to run once at the start
watch(
  open,
  (o) => {
    if (!o || !target.value) return
    const n = budgetIn(target.value, props.month)
    text.value = n ? String(n) : ''
    scope.value = hasOwn.value || target.value.budget ? 'month' : 'default'
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
  const next = Math.round(n)
  const budgets = { ...othersOf(t) }
  // 已經過去的月份不受影響：它們原本跟著舊的預設，所以先把舊金額固定下來
  if (t.budget && t.budget !== next) {
    const earliest = data.records.reduce((m, r) => (r.date < m ? r.date : m), `${props.month}-01`)
    let m = t.budgetFrom ?? ym(earliest)
    for (let i = 0; m < props.month && i < 240; i++, m = addYm(m, 1)) {
      if (!(m in budgets)) budgets[m] = t.budget
    }
  }
  await store({ ...t, ...defaultBudget(t, next, props.month), budgets: Object.keys(budgets).length ? budgets : undefined })
}

function submit() {
  return scope.value === 'month' ? saveMonth() : saveDefault()
}

async function reset() {
  const t = target.value
  if (t) await store({ ...t, budgets: othersOf(t) })
}
</script>

<template>
  <!-- 置中小視窗：鍵盤出現時，視窗置中在鍵盤上方剩下的空間 -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open && target"
        class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
        :style="{ paddingTop: `calc(1rem + ${offsetTop}px)`, paddingBottom: `calc(1rem + ${keyboard}px)` }"
        @click.self="open = false"
        @keydown.esc="open = false"
      >
        <form class="card w-full max-w-[21rem] space-y-5 p-5 shadow-xl" @submit.prevent="submit">
          <div class="flex items-center justify-between gap-2">
            <h2 class="min-w-0 text-lg leading-snug font-bold">{{ target.name }}的預算（{{ monthNo }} 月）</h2>
            <button type="button" class="icon-btn -my-2 -mr-2 size-9 border-0 bg-transparent text-muted" aria-label="關閉" @click="open = false">
              <X :size="18" />
            </button>
          </div>
          <div class="space-y-3">
            <div>
              <div class="mb-1.5 flex items-center justify-between gap-3">
                <label class="label !mb-0" for="budget-amount">金額</label>
                <!-- 這個月自訂過才有：改回跟著預設 -->
                <button v-if="hasOwn" type="button" class="inline-flex items-center gap-1 text-xs text-muted active:scale-95" @click="reset">
                  <RotateCcw :size="12" />改回預設
                </button>
              </div>
              <input id="budget-amount" v-model="text" class="input" inputmode="numeric" placeholder="0（不設預算）" />
            </div>
            <!-- the note sits in the left column under the label, so it never runs under the switch -->
            <div class="flex items-start justify-between gap-3 px-1">
              <div class="min-w-0 flex-1">
                <p class="text-sm">每個月都用這個金額</p>
                <!-- on changes the default: a first one starts in this month, an existing one keeps its start month -->
                <p class="mt-1 text-xs text-muted">
                  從 {{ monthNo }} 月起，沒有自訂的月份都用這個金額，更早的月份不受影響。
                </p>
              </div>
              <ToggleSwitch v-model="everyMonth" label="每個月都用這個金額" class="-mt-1" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-soft" @click="open = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="amount == null">儲存</button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
